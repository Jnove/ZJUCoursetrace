[**🌐 Switch to English**](./README-en.md)

# ZJU 课表

浙江大学课程表应用程序，支持 iOS、Android 和 Web 端。

## 说明

在开发过程中使用了 Manus 生成项目架构（虽然它干得不是那么好）后续代码完善中也得到了claude等ai的“支持”

## 技术栈

**前端 / 客户端**

- [Expo](https://expo.dev) + [React Native](https://reactnative.dev) — 跨平台框架，一套代码支持 iOS、Android 和 Web
- [Expo Router](https://expo.github.io/router) — 基于文件系统的路由方案
- [expo-location](https://docs.expo.dev/versions/latest/sdk/location/) — 设备定位，支持 GPS 缓存和无 GMS 环境回退
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) — 课程常驻通知
- [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) — 课程表本地持久化缓存
- TypeScript — 全项目类型安全

**后端 / 服务端**

- [Node.js](https://nodejs.org) + [Express](https://expressjs.com) — REST API 服务
- [Puppeteer](https://pptr.dev) — 无头浏览器，模拟登录浙大统一身份认证并解析课程 HTML

**外部 API**

- [Open-Meteo](https://open-meteo.com) — 开源天气预报，根据经纬度返回每日气温和降雨概率
- [今日诗词](https://www.jinrishici.com) — 随机古典诗词
- [ipify](https://www.ipify.org) + [iping.cc](https://iping.cc) — IP 定位（无 GPS 缓存时的兜底方案）

## 功能特点

- **主屏幕** — 概览当日课程，包括时间、地点和教师信息；展示正在进行的课程及倒计时进度条
- **每日诗词** — 首页随机展示一句古典诗词，来自今日诗词 API
- **实时天气** — 自动定位（GPS 缓存 → IP 定位），显示气温区间、降雨概率和出行提示；21 点后自动切换为明日天气
- **课程常驻通知** — Android 状态栏实时显示当前课程或下节课及倒计时，静默常驻不打扰
- **课程表** — 支持周网格视图和日列表视图，一键切换
- **周次导航** — 通过上一周/下一周按钮切换周次；显示单/双周标识
- **学期选择器** — 下拉菜单切换已导入课程的所有学期
- **课程详情** — 点击任意课程块可弹窗查看完整信息（教师、教室、周次类型、考试安排）
- **深色/浅色/跟随系统主题** — 在设置中切换
- **离线支持** — 课程表本地缓存，重新打开应用时立即加载

## 项目结构

```
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx              # 主屏幕（今日课程 + 诗词 + 天气 + 登录表单）
│   │   ├── schedule.tsx           # 课程表界面
│   │   └── settings.tsx           # 主题切换 + 退出登录
│   └── courseDetailContent.tsx
│
├── components/
│   └── schedule-table.tsx         # 网格和列表形式的课程表渲染器
│
├── lib/
│   ├── auth-context.tsx           # 登录/登出状态管理
│   ├── schedule-context.tsx       # 课程获取和缓存逻辑
│   ├── semester-utils.ts          # 当前学期/周次计算工具
│   └── course-notification.ts     # 课程常驻通知管理
│
├── server/
│   ├── _core/zju-service.ts       # Puppeteer 登录 + HTML 解析
│   └── api-routes.ts              # REST API 端点
│
├── assets/                        # 图片资源
```

## 快速开始

**依赖环境**

- Node.js 18+
- pnpm 9+
- Chromium / Chrome（如果未找到，Puppeteer 会自动下载一份）

**安装与运行**

```bash
pnpm install
pnpm dev        # 启动 API 服务（端口 3000）和 Expo（端口 8081）
```

在浏览器中打开 http://localhost:8081，或用 Expo Go 扫描二维码。

**环境变量** — 创建 `.env` 文件：

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000  # 或使用你的局域网 IP
```

**构建 APK（Android）**

需要 Expo 账户和 EAS CLI：

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

- **仅支持单用户** — 后端维护一个共享的 Puppeteer 浏览器会话，因此每台服务器实例同时只能登录一个账户
- **重启后数据不保留** — 服务器缓存存储在内存中；重启服务器会清除所有缓存的课程表，需要重新登录
- **学期加载较慢** — 学期选择器在登录后后台填充数据，首次使用时可能显示为空，请等待约半分钟
- **学期检测不完整** — 处于学期之间的日期（如考试周、假期）会返回空值，主屏幕显示无数据
- **Android 无 GMS 定位较慢** — 不预装 Google Play 服务的设备（如部分国产手机）GPS 冷启动较慢，首次定位会自动回退到 IP 定位
- **iOS 不支持常驻通知** — 系统限制，课程通知在 iOS 上可被用户手动清除
