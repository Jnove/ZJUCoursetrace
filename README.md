# ZJU课迹 （ZJUCousrsetrace）

<p align="center">
  <br><a href="README.md">中文</a> | English
</p

[![License](https://img.shields.io/github/license/Jnove/ZJUCoursetrace?style=flat-square)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/Jnove/ZJUCoursetrace?style=flat-square&label=release)](https://github.com/Jnove/ZJUCoursetrace/releases/latest)
[![Download APK](https://img.shields.io/github/downloads/Jnove/ZJUCoursetrace/total?style=flat-square&label=APK%20downloads&color=brightgreen&logo=android)](https://github.com/Jnove/ZJUCoursetrace/releases/download/2.0.0/ZJUCoursetrace.v2.0.0.apk)

浙江大学课程表应用，支持 iOS、Android 和 Web 端。v2.0.0 起已完全移除后端服务，所有认证与数据请求均在客户端本地完成。

## 说明

本项目最初由 Manus 生成项目框架，后经大量重写与迭代完善。在开发过程中也得到了 Claude，deepseek 等 AI 的"支持"。

## 技术栈

**前端 / 客户端**

- [Expo](https://expo.dev) + [React Native](https://reactnative.dev) — 跨平台框架，一套代码支持 iOS、Android 和 Web
- [Expo Router](https://expo.github.io/router) — 基于文件系统的路由方案
- [expo-location](https://docs.expo.dev/versions/latest/sdk/location/) — 设备定位，支持 GPS 缓存和无 GMS 环境回退
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) — 课程常驻通知
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) — 凭据安全存储，支持会话过期后静默重新登录
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — 课程表本地持久化缓存
- TypeScript — 全项目类型安全

**认证 / 数据**

v2.0.0 起不再需要后端服务器。所有对浙大教务系统的请求均由客户端直接发起：
- 利用 iOS NSURLSession / Android OkHttp 的 **native cookie jar** 自动维护会话
- CAS 统一认证、课表、成绩、考试信息均直连 `zdbk.zju.edu.cn`
- 凭据通过 `expo-secure-store` 加密保存，会话过期后自动重新登录

**外部 API**

- [Open-Meteo](https://open-meteo.com) — 开源天气预报，根据经纬度返回每日气温和降雨概率
- [今日诗词](https://www.jinrishici.com) — 随机古典诗词
- [httpbin.org](https://httpbin.org/ip) + [api.iping.cc](https://api.iping.cc) — IP 定位（无 GPS 缓存时的兜底方案）
- [GitHub Releases API](https://docs.github.com/en/rest/releases) — 应用内自动更新检测

## 功能特点

**首页**
- 概览当日课程，包括时间、地点和教师信息
- 正在进行的课程显示实时倒计时进度条
- 每日随机古典诗词
- 实时天气：自动定位（GPS 缓存 → IP 定位），显示气温区间、降雨概率和出行提示；21 点后自动切换为明日天气

**课程表**
- 周网格视图与日列表视图，一键切换
- 学期选择器，支持多学期数据切换
- 单 / 双周筛选
- 一键截图并分享或保存到相册

**学业**
- 主修绩点与全部绩点概览（含学分统计）
- 成绩详情：分数分布图、逐课绩点进度条，支持主修 / 全部切换
- 考试安排：按学期分组，显示考试时间、地点、座位号及倒计时
- 数据本地缓存，后台静默刷新

**通知与设置**
- Android 状态栏实时显示当前课程或下节课及倒计时，静默常驻不打扰
- 深色 / 浅色 / 跟随系统主题
- 个性化：15 种界面主题色、3 种圆角样式、5 套课程色彩方案，含实时预览
- 应用内更新检测：Android 支持直接下载安装 APK，iOS 跳转 GitHub Releases
- 离线支持：课程表本地缓存，重新打开应用时立即加载

## 项目结构

```
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx              # 首页（今日课程 + 诗词 + 天气 + 登录表单）
│   │   ├── schedule.tsx           # 课程表界面
│   │   ├── Academic.tsx           # 学业（绩点 + 考试）
│   │   └── settings.tsx           # 主题切换 + 退出登录
│   ├── grade-detail.tsx           # 成绩详情页
│   ├── course-detail.tsx          # 课程详情页
│   ├── diagnostic-logs.tsx        # 诊断日志
│   ├── personalization.tsx        # 个性化设置
│   ├── about.tsx                  # 关于 + 检查更新
│   └── courseDetailContent.tsx    # 课程详情组件
│
├── components/
│   └── schedule-table.tsx         # 网格和列表形式的课程表渲染器
│
├── lib/
│   ├── zju-client.ts              # CAS 认证 + 全部数据请求（无服务端）
│   ├── auth-context.tsx           # 登录/登出状态管理
│   ├── schedule-context.tsx       # 课程获取和缓存逻辑
│   ├── semester-utils.ts          # 当前学期/周次计算工具（含农历）
│   ├── course-palette.ts          # 课程色彩方案 + 图着色算法
│   ├── theme-provider.tsx         # 主题、主色、圆角全局管理
│   ├── course-notification.ts     # 课程常驻通知管理
│   └── updater.ts                 # GitHub Releases 更新检测
│
└── assets/                        # 图片资源
```

## 快速开始

**依赖环境**

- Node.js 18+
- pnpm 9+

v2.0.0 起无需 Chromium / Chrome，也无需启动任何后端服务。

**安装与运行**

```bash
pnpm install
npx expo start
```

在浏览器中打开 [http://localhost:8081](http://localhost:8081)，或用 Expo Go 扫描二维码。

**环境变量**

v2.0.0 起无需配置 `.env` 文件中的 API 地址，客户端直接请求浙大教务系统。

**构建 APK（Android）**

需要 [Expo](https://expo.dev) 账户和 EAS CLI：

```bash
npm install -g eas-cli
eas login
```

然后构建：

```bash
# 预览版 APK（推荐用于测试）
eas build --platform android --profile preview

# 生产版 APK
eas build --platform android --profile production
```

构建完成后，终端和 Expo 控制台会显示 APK 下载链接。

## 已知问题

- **仅支持单用户** — 每台设备上只能同时登录一个账户（native cookie jar 限制）
- **学期检测不完整** — 处于学期之间的日期（如考试周、假期）返回空值，首页显示无数据
- **Android 无 GMS 定位较慢** — 不预装 Google Play 服务的设备 GPS 冷启动较慢，首次定位会自动回退到 IP 定位
- **iOS 不支持常驻通知** — 系统限制，课程通知在 iOS 上可被用户手动清除
- **CAS 账号锁定** — 多次密码错误后账号可能触发滑块验证，需先在浏览器访问 [zjuam.zju.edu.cn](https://zjuam.zju.edu.cn) 手动解锁
