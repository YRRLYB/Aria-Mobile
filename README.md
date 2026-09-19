# Aria Mobile

Aria Mobile is an Android music player for the Aria desktop ecosystem. It supports both LAN companion mode and direct NetEase Cloud Music mode.

## Latest Beta

- Version: `0.4.17-beta.0`
- Android version code: `37`
- APK: `Aria-mobile-0.4.17-beta.0.apk`

The latest beta APK is included at the repository root with the beta tag. Older APK files remain ignored.

## Features

- LAN companion playback from an Aria desktop library.
- Direct NetEase Cloud Music login with QR code or SMS verification.
- Native Android foreground playback with lock-screen media controls.
- Queue playback, gapless preloading, lyrics, history, liked tracks and playlists.
- Local device music scanning and offline playback.
- Android 11 and older WebView CSS compatibility fallback.
- Experimental USB audio focus mode.

## Requirements

- Node.js 20 or newer.
- JDK 17 or 21.
- Android SDK with API 35 installed.
- Android Studio is optional; Gradle wrapper commands are included.

## Development

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:5183`.

## Checks

```bash
npm exec tsc -- --noEmit
npm exec vitest run
npm run build
```

## Android Build

```bash
npm run apk:debug
npm run apk:release
```

The debug APK is generated at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Project Layout

- `src/`: mobile UI, screens and native bridges.
- `core/`: shared player, queue, API and data logic.
- `android/`: Capacitor Android project and native playback service.
- `assets/`: application icon and splash assets.

## Notes

NetEase credentials are stored locally on the device. Login rate limits are enforced by NetEase and cannot be bypassed by reinstalling the app. Desktop companion mode requires the phone and desktop to be on a trusted LAN.
