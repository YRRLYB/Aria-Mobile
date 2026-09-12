# Aria Mobile

<p align="center">
  <img src="assets/icon-only.png" width="110" alt="Aria Mobile logo" />
</p>

Aria 的 Android 播放器。与桌面端(E:\Code\Aria 或其 GitHub 仓库)组成「双人成行」:

- **独立模式(M2 起可用)**:手机直连网易云音乐,扫码登录、每日推荐、私人漫游、歌单、歌词,电脑全程不用开机。
- **伴侣模式(现有)**:局域网连接桌面端,串流电脑上的本地无损曲库,遥控播放。
- **双端同步(M3/M4)**:播放历史、喜欢、进度在两端自动同步;局域网直连,跨网走 Cloudflare 免费中继。

规划与里程碑见 [PLAN.md](PLAN.md);网易云接入的维护指南见 [NETEASE_API.md](NETEASE_API.md)。

## 结构

```
├─ src/          # 移动壳:连接页、底部 Tab、MiniPlayer、沉浸播放页、原生音频桥
├─ core/         # 与桌面端同源的前端核心(api 客户端、hooks、播放队列/时钟、歌词)
├─ android/      # Capacitor 原生工程
│   └─ .../netease/   # 网易云直连模块(加密已 golden 测试,HTTP 层 M2 实现)
└─ assets/       # 图标/启动屏源图
```

桌面端与 `core/` 目前是同源拷贝:桌面仓库的 `src/lib|hooks|data` 变更后,
拷贝到本仓库 `core/` 并跑一遍构建即可。

## 开发

```bash
npm install
npm run dev          # 手机浏览器访问 http://<电脑IP>:5183 测试完整链路
npm run build        # vite 构建
npm run sync         # build + 写入 android 工程
cd android && gradlew.bat assembleDebug   # JDK 17/21 + Android SDK
```

前置:JDK 21 + Android SDK(`android/local.properties` 指向 SDK 路径,不入库)。
桌面端如需伴侣模式,在桌面 设置 → 手机远程访问 打开开关并复制地址与令牌。

## 说明

- 连接桌面端走明文 HTTP + 配对令牌,仅限可信局域网。
- 网易云能力需要登录自己的账号;Cookie 只保存在本机。
- 状态:MVP 迭代中,接口与界面会继续调整。
