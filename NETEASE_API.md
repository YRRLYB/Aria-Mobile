# NETEASE_API.md — 手机直连接口模块(agent 维护指南)

> 这个模块让 Aria 手机版**不依赖桌面**直接访问网易云音乐。改任何签名/请求代码前先读完本文。
> 状态:M2(0.2.0)进行中——加密层已完成并全量 golden 测试,HTTP 层与接口待实现。

## 模块结构

```
android/app/src/main/java/com/yrrlyb/aria/mobile/netease/
├── NeteaseCrypto.java     # 签名原语(已完成,golden 测试 7/7)
├── NeteaseClient.java     # HTTP 客户端 + 各接口(一个接口一个方法)
├── NeteaseSession.kt/.java# Cookie 存储(扫码登录产物,SharedPreferences)
└── model/                 # 响应数据类
```

## 改动纪律(golden 测试)

- `NeteaseCryptoGoldenTest` 用 Node 原版生成的**确定性向量**钉死每个原语的输出字节。
  固定 secret:`pS2cXyQz1AvWmL5N`,固定文本:`{"foo":"bar"}`。
- **改签名逻辑前先跑测试**(`gradlew testDebugUnitTest`);测试红了说明行为变了,停下来 diff。
- 重新生成向量的 Node 片段(在桌面仓库 E:\Code\Aria 下运行):

```js
const crypto = require('NeteaseCloudMusicApi/util/crypto.js');
const forge = require('node-forge');
const secret = 'pS2cXyQz1AvWmL5N';
const text = JSON.stringify({foo:'bar'});
const inner = crypto.aesEncrypt(text, 'cbc', '0CoJUm6Qyw8W8jud', '0102030405060708');
console.log(crypto.aesEncrypt(inner, 'cbc', secret, '0102030405060708'));            // params
const rsa = forge.pki.publicKeyFromPem(`-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`);
console.log(forge.util.bytesToHex(rsa.encrypt(secret.split('').reverse().join(''), 'NONE'))); // encSecKey
// eapi 必须:md5("nobody"+url+"use"+text+"md5forencrypt") 再组帧 url-36cd479b6b5-text-36cd479b6b5-digest
```

## 签名要点(与 Node 版逐字节一致的已被测试钉死)

| 原语 | 算法 | 用途 |
|---|---|---|
| weapi | AES-128-CBC(PKCS7,iv=`0102030405060708`)两层:第一层固定 key `0CoJUm6Qyw8W8jud`,第二层随机 16 位 base62 secret;RSA-1024 无填充(secret 反转),hex 小写 | 大部分网页接口 |
| linuxapi | AES-128-ECB(key=`rFgB&h#%2?^eDg:Q`)hex 大写 | linux 渠道接口 |
| eapi | `md5("nobody"+url+"use"+text+"md5forencrypt")` → 帧 `url-36cd479b6b5-text-36cd479b6b5-digest` → AES-128-ECB(key=`e82ckenh8dichen8`)hex 大写 | 安装包渠道接口(音质最好) |

注意:weapi 的 secret 是**随机**的,不存在固定 secret 的官方路径;golden 测试通过
`weapiWithSecret(text, secret)` 注入。

## HTTP 层约定(实现 NeteaseClient 时遵守)

- 基址 `https://music.163.com`(weapi 路径 `/weapi/<api>`,eapi 路径 `https://interface3.music.163.com/eapi/<api>`)
- 必带请求头:`User-Agent`(仿官方客户端)、`Referer: https://music.163.com`
- Cookie:扫码登录得到 `MUSIC_U`(核心凭据)+ `os=pc` 等;匿名请求需要 `NMTID`/anonymous token(桌面版逻辑见 `E:\Code\Aria\server\clients\neteaseClient.ts`)
- 响应一律 `{"code":200, ...}`;code!=200 抛 `NeteaseException(code, message)`
- 缓存与节流:照抄桌面版策略(stream URL 缓存 25 分钟、歌词 7 天、搜索 5 分钟),避免风控

## M2 端点清单(一个接口一个方法,完成打勾)

- [ ] `loginQrKey()` → key(weapi)
- [ ] `loginQrCreate(key)` → 二维码图
- [ ] `loginQrCheck(key)` → 800/801/802/803,MUSIC_U 在 803 的 cookie 里
- [ ] `userAccount(cookie)` → userId/昵称/头像
- [ ] `likedList(cookie, uid)` → 喜欢 id 集合(≤2000,分页)
- [ ] `dailyRecommendations(cookie)` → 每日推荐
- [ ] `personalFm(cookie, limit)` → 私人漫游
- [ ] `userPlaylists(cookie, uid)` → 歌单列表
- [ ] `playlistTrackAll(cookie, id, page)` → 歌单曲目(1000/页,≤5000)
- [ ] `cloudSearch(cookie, keyword)` → 搜索(曲目/歌手)
- [ ] `lyric(cookie, id)` → 歌词(含翻译)
- [ ] `songUrlV1(cookie, id, level)` → 取流地址(**用 eapi**,音质档 lossless/hires/jymaster)
- [ ] `setLike(cookie, id, like)` → 喜欢/取消

参考实现(桌面 Node 版,语义完全对齐):
`E:\Code\Aria\server\clients\neteaseClient.ts` + `E:\Code\Aria\server\services\neteaseService.ts`
