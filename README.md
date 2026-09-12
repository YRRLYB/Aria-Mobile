# Aria Mobile

Aria 的 Android 伴侣 App:通过局域网连接桌面端 Aria,同步网易云歌单并串流播放电脑上的本地曲库。基于 Capacitor 封装现有 React 前端,播放由原生前台服务(Media3/ExoPlayer)承载,支持后台播放与系统媒体卡片。

## 架构

```
手机 Aria Mobile                    电脑 Aria 桌面端
┌─────────────────────┐   HTTP + token   ┌──────────────────────┐
│ 复用的 React 前端     │ ───────────────▶ │ Express 后端 (:3636) │
│ (mobile/src + src/) │  Range 音频流     │  网易云代理/本地曲库   │
│ AriaAudio 原生插件   │ ◀─────────────── │  「手机远程访问」开关  │
│ (ExoPlayer 前台服务) │                  └──────────────────────┘
└─────────────────────┘
```

- `mobile/src/`:移动壳(连接页、底部 Tab、MiniPlayer、全屏播放页、原生音频桥)。
- `../src/`:与桌面端**共用**的数据层(api 客户端、hooks、播放队列/时钟、歌词、封面),通过 Vite alias `@` 引用,不复制代码。
- `android/`:Capacitor 生成的原生工程,含 `AriaAudioPlugin`(JS↔原生桥)与 `AriaPlaybackService`(ExoPlayer + MediaSession 前台服务)。

## 连接与安全

1. 桌面端:设置 → **手机远程访问** → 打开开关(首次会自动生成连接令牌并重启后端,绑定 0.0.0.0)。
2. 手机:填入桌面端显示的服务器地址(如 `http://192.168.1.29:3636`)与连接令牌;或复制桌面端二维码内容后点「自动填入」。
3. 鉴权:除 `/api/health` 外所有接口要求 `Authorization: Bearer <token>` 或 `?token=`(媒体标签用后者);本机回环访问免鉴权,桌面端自身不受影响。
4. 注意:连接走**明文 HTTP + 令牌**,仅适合家庭等可信局域网;离开该网络时 App 不可用(桌面端须在线)。

## 开发

```bash
cd mobile
npm install
npm run dev        # 手机浏览器访问 http://<电脑IP>:5183 即可测试完整链路
```

要求:桌面端已开启「手机远程访问」。浏览器模式下使用 HTML5 audio 播放(无后台播放能力);打包进 App 后自动切换到原生引擎。

## 构建 APK

前置:JDK 17 与 Android SDK(本仓库将其放在 `.tools/` 下,已 gitignore;`mobile/android/local.properties` 指向 SDK 路径)。

```bash
cd mobile
npm run sync        # vite build + cap sync android
cd android && gradlew.bat assembleDebug   # 产物 android/app/build/outputs/apk/debug/
```

## 明确不支持(首版)

- 独立运行:必须连接桌面端(网易云 API 与本地曲库索引都在桌面端)。
- 手机本地文件扫描、频谱可视化、CD 光驱、WASAPI、iOS(架构兼容,需要 Mac 构建)。
