package com.yrrlyb.aria.mobile.netease;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Port of NeteaseCloudMusicApi's signing primitives (util/crypto.js, MIT) for
 * the standalone phone client. One function per crypto primitive; the golden
 * unit test {@code NeteaseCryptoGoldenTest} pins every output byte to vectors
 * produced by the upstream Node implementation — if this test is green, any
 * rewrite/refactor of this file is behaviour-compatible.
 *
 * Reference implementation: E:/Code/Aria/node_modules/NeteaseCloudMusicApi/util/crypto.js
 * Design notes + endpoint list: NETEASE_API.md in the repository root.
 */
public final class NeteaseCrypto {
    private static final String IV = "0102030405060708";
    private static final String PRESET_KEY = "0CoJUm6Qyw8W8jud";
    private static final String LINUXAPI_KEY = "rFgB&h#%2?^eDg:Q";
    private static final String EAPI_KEY = "e82ckenh8dichen8";
    private static final String BASE62 =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final String PUBLIC_KEY_DER_BASE64 =
            "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB";
    private static final String EAPI_SEPARATOR = "-36cd479b6b5-";

    private static final SecureRandom RANDOM = new SecureRandom();

    private NeteaseCrypto() {
    }

    public record WeapiParams(String params, String encSecKey) {
    }

    public record LinuxapiParams(String eparams) {
    }

    public record EapiParams(String params) {
    }

    /** AES-128-CBC/PKCS7 with the shared IV, Base64-encoded. */
    public static String aesCbcBase64(String text, String key) {
        try {
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES"),
                    new IvParameterSpec(IV.getBytes(StandardCharsets.UTF_8)));
            return Base64.getEncoder().encodeToString(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("netease aes-cbc failed", error);
        }
    }

    /** AES-128-ECB/PKCS7, uppercase hex (matches CryptoJS ciphertext.toString()). */
    public static String aesEcbHex(String text, String key) {
        try {
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "AES"));
            return hexUpper(cipher.doFinal(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("netease aes-ecb failed", error);
        }
    }

    /**
     * Textbook RSA (forge scheme "NONE"): no padding, data ^ e mod n, left
     * padded to the 1024-bit key length, lowercase hex. The input must stay
     * below the modulus (16-char secret does).
     */
    public static String rsaNoPadHex(String text) {
        try {
            byte[] der = Base64.getDecoder().decode(PUBLIC_KEY_DER_BASE64);
            RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
            BigInteger data = new BigInteger(1, text.getBytes(StandardCharsets.ISO_8859_1));
            byte[] signature = data.modPow(publicKey.getPublicExponent(), publicKey.getModulus()).toByteArray();
            // BigInteger keeps a sign bit: when the top byte is >= 0x80 the
            // array grows to 129 bytes and must be stripped back to 128
            // (this failed ~50% of weapi calls depending on the random key).
            if (signature.length > 1 && signature[0] == 0) {
                byte[] stripped = new byte[signature.length - 1];
                System.arraycopy(signature, 1, stripped, 0, stripped.length);
                signature = stripped;
            }
            int keyBytes = (publicKey.getModulus().bitLength() + 7) / 8;
            byte[] padded = new byte[keyBytes];
            System.arraycopy(signature, 0, padded, keyBytes - signature.length, signature.length);
            return hexLower(padded);
        } catch (Exception error) {
            throw new IllegalStateException("netease rsa failed: " + error.getClass().getSimpleName()
                    + " " + error.getMessage(), error);
        }
    }

    /**
     * weapi with an injected 16-char base62 secret. Production callers use
     * {@link #weapi(String)} (random secret); tests inject a fixed one so the
     * output is reproducible.
     */
    public static WeapiParams weapiWithSecret(String text, String secretKey) {
        String inner = aesCbcBase64(text, PRESET_KEY);
        String reversed = new StringBuilder(secretKey).reverse().toString();
        return new WeapiParams(aesCbcBase64(inner, secretKey), rsaNoPadHex(reversed));
    }

    /** weapi as the Node library does it: fresh random 16-char base62 secret. */
    public static WeapiParams weapi(String text) {
        StringBuilder secret = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            secret.append(BASE62.charAt(RANDOM.nextInt(62)));
        }
        return weapiWithSecret(text, secret.toString());
    }

    /** linuxapi: AES-128-ECB hex over the JSON payload. */
    public static LinuxapiParams linuxapi(String text) {
        return new LinuxapiParams(aesEcbHex(text, LINUXAPI_KEY));
    }

    /** eapi: MD5 digest over the message frame, then AES-128-ECB hex. */
    public static EapiParams eapi(String url, String text) {
        String digest = md5Hex("nobody" + url + "use" + text + "md5forencrypt");
        String data = url + EAPI_SEPARATOR + text + EAPI_SEPARATOR + digest;
        return new EapiParams(aesEcbHex(data, EAPI_KEY));
    }

    /** Lowercase hex MD5 (used for cellphone login passwords). */
    public static String md5Hex(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            return hexLower(md.digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("md5 failed", error);
        }
    }

    private static String hexUpper(byte[] bytes) {
        return hex(bytes, true);
    }

    private static String hexLower(byte[] bytes) {
        return hex(bytes, false);
    }

    private static String hex(byte[] bytes, boolean upper) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            String hex = Integer.toHexString(b & 0xFF);
            if (hex.length() == 1) out.append('0');
            out.append(upper ? hex.toUpperCase() : hex);
        }
        return out.toString();
    }
}
