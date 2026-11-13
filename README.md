# Aria Mobile

<p align="center">
  <img src="assets/icon-only.png" width="128" alt="Aria Mobile 应用图标" />
</p>

Aria Mobile 是 Aria 桌面端的 Android 音乐播放器，支持局域网伴侣模式和网易云音乐直连模式。

## 最新版本

- 版本：`0.5.6`
- Android versionCode：`44`
- 构建产物：`Aria-Mobile-0.5.6.apk`
- 本版本为本地正式构建，GitHub Release 待发布。

## 主要功能

- 局域网连接 Aria 桌面端，播放桌面端曲库。
- 手机直连网易云音乐，支持二维码登录和短信验证码登录。
- Android 原生前台播放服务和锁屏媒体控制。
- 播放队列、无缝预加载、歌词、播放历史、喜欢列表和歌单。
- 歌单记住上次播放的歌曲和进度；随机播放的上一首按真实播放历史返回。
- 封面与音频缓存管理，可在设置中查看占用并清理。
- 扫描手机本地音乐并支持离线播放。
- 兼容 Android 11 及旧版 WebView 的界面样式回退。
- USB 音频焦点实验功能。

## 开发环境

- Node.js 20 或更高版本。
- JDK 17 或 21。
- Android SDK API 35。
- Android Studio 可选，项目已包含 Gradle Wrapper。

## 本地开发

```bash
npm install
npm run dev
```

开发服务器地址：`http://localhost:5183`。

## 检查与构建

```bash
npm exec tsc -- --noEmit
npm exec vitest run
npm run build
```

构建 Android APK：

```bash
npm run apk:debug
npm run apk:release
```

Debug APK 输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 项目结构

- `src/`：移动端界面、页面和原生桥接。
- `core/`：播放器、播放队列、API 和数据逻辑。
- `android/`：Capacitor Android 工程和原生播放服务。
- `assets/`：应用图标和启动图资源。

## 应用图标

- `assets/icon-only.png`：README 展示和圆形图标主体。
- `assets/icon-background.png`：带背景的应用图标。
- `assets/splash.png`：启动页图片。

以上图标资源已提交到 GitHub 项目中。

## 注意事项

网易云账号凭据只保存在设备本地。验证码调用次数受网易云服务端限制，应用无法绕过限制。桌面伴侣模式要求手机和电脑处于可信局域网内。
