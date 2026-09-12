import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, Server, Smartphone } from "lucide-react";
import { parsePairingPayload, readConnection, saveConnection, verifyConnection } from "./connection";

// Pairing gate shown until the phone has a working link to a desktop Aria.
export function ConnectScreen({ onConnected }: { onConnected: () => void }) {
  const saved = readConnection();
  const [serverUrl, setServerUrl] = useState(saved.serverUrl);
  const [token, setToken] = useState(saved.token);
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "unreachable" | "unauthorized">("idle");
  const [pasteHint, setPasteHint] = useState("");

  async function connect() {
    if (!serverUrl.trim()) return;
    setStatus("connecting");
    const result = await verifyConnection(serverUrl, token);
    if (result.ok) {
      saveConnection(serverUrl, token);
      setStatus("ok");
      onConnected();
      return;
    }
    setStatus(result.reason === "unauthorized" ? "unauthorized" : "unreachable");
  }

  async function readClipboardPairing() {
    try {
      const text = await navigator.clipboard.readText();
      const pairing = parsePairingPayload(text);
      if (!pairing) {
        setPasteHint("剪贴板里没有有效的 Aria 配对信息");
        return;
      }
      setServerUrl(pairing.urls[0]);
      setToken(pairing.token);
      setPasteHint("");
    } catch {
      setPasteHint("无法读取剪贴板,请手动输入");
    }
  }

  return (
    <div className="safe-top flex min-h-full flex-col bg-[linear-gradient(165deg,#f7f8fb_0%,#eef1fa_58%,#f6eff9_100%)] px-6 pb-10">
      <div className="flex flex-1 flex-col justify-center py-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-neutral-950 text-white shadow-lg">
              <Smartphone className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold">Aria 手机版</h1>
              <p className="text-xs text-neutral-500">连接同一局域网内的 Aria 桌面端</p>
            </div>
          </div>

          <div className="mt-8 space-y-4 rounded-[1.4rem] border border-white/75 bg-white/70 p-5 shadow-[0_18px_60px_rgba(47,55,76,0.12)] backdrop-blur">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">服务器地址</span>
              <input
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="http://192.168.1.29:3636"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 w-full rounded-[0.9rem] border border-neutral-950/10 bg-white px-3.5 py-3 font-mono text-sm outline-none transition focus:border-neutral-950/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">连接令牌</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="在桌面端 设置 → 手机远程访问 里查看"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 w-full rounded-[0.9rem] border border-neutral-950/10 bg-white px-3.5 py-3 font-mono text-sm outline-none transition focus:border-neutral-950/40"
              />
            </label>

            <button
              type="button"
              onClick={readClipboardPairing}
              className="w-full rounded-[0.9rem] bg-neutral-950/[0.04] px-3 py-2.5 text-xs text-neutral-500 transition active:bg-neutral-950/[0.08]"
            >
              已复制桌面端二维码内容?点此自动填入
            </button>
            {pasteHint && <p className="text-xs text-amber-600">{pasteHint}</p>}

            <button
              type="button"
              disabled={!serverUrl.trim() || status === "connecting"}
              onClick={connect}
              className="tap-scale flex w-full items-center justify-center gap-2 rounded-[1rem] bg-neutral-950 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_34px_rgba(23,23,23,0.24)] transition disabled:opacity-50"
            >
              {status === "connecting" ? <Loader2 className="size-4 animate-spin" /> : <Server className="size-4" />}
              {status === "connecting" ? "正在连接…" : "连接"}
            </button>

            {status === "unreachable" && (
              <p className="flex items-start gap-2 text-xs text-red-600">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                连不上服务器:确认手机与电脑在同一 Wi-Fi,桌面端已开启「手机远程访问」,且地址和端口正确。
              </p>
            )}
            {status === "unauthorized" && (
              <p className="flex items-start gap-2 text-xs text-red-600">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                令牌不正确:请在桌面端 设置 → 手机远程访问 里复制最新的连接令牌。
              </p>
            )}
          </div>

          <ol className="mt-6 space-y-2 rounded-[1.2rem] border border-white/70 bg-white/55 p-4 text-xs leading-5 text-neutral-500">
            <li>1. 电脑上打开 Aria → 设置 → 手机远程访问,打开开关。</li>
            <li>2. 复制页面上的服务器地址与令牌(或截图二维码)。</li>
            <li>3. 回到这里填入并连接,之后手机就能听电脑上的全部音乐。</li>
          </ol>
        </motion.div>
      </div>
      {status === "ok" && (
        <p className="flex items-center justify-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="size-4" /> 连接成功
        </p>
      )}
    </div>
  );
}
