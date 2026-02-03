# ZJU 课表助手 - 快速开始指南

## 📱 快速安装

### 方式 1: 使用 Expo Go（最快）

1. **在 Android 手机上安装 Expo Go**
   - 打开 Google Play Store
   - 搜索 "Expo Go"
   - 点击安装

2. **启动开发服务器**
   ```bash
   cd /home/ubuntu/zju-schedule-app
   pnpm dev
   ```

3. **扫描 QR 码**
   - 在 Expo Go 中点击 "Scan QR code"
   - 扫描终端显示的二维码
   - 应用将自动加载

### 方式 2: 生成 APK 文件

详见 [BUILD_APK.md](BUILD_APK.md) 文件

## 🔐 登录

应用启动后，您将看到登录屏幕：

- **用户名**: 您的浙江大学学号
- **密码**: 您的CAS密码

> **注意**: 当前版本使用模拟登录进行演示。要集成真实的CAS认证，请参考项目文档。

## 📚 功能介绍

### 主屏幕 - 课表展示
- 显示当前周的课程安排
- 7天 × 8节课网格布局
- 点击课程卡片查看详细信息

### 周次导航
- 使用左右箭头切换周次
- 显示每周的课程数量

### 课程详情
- 点击任意课程查看完整信息
- 包括教师、教室、时间等详细信息

### 设置
- 查看用户信息
- 登出账户

## 🛠️ 开发

### 项目结构

```
zju-schedule-app/
├── app/                    # 应用主体
│   ├── (tabs)/            # Tab 导航
│   │   ├── index.tsx      # 主屏幕
│   │   └── _layout.tsx    # Tab 配置
│   ├── login.tsx          # 登录屏幕
│   ├── course-detail.tsx  # 课程详情
│   └── _layout.tsx        # 根布局
├── components/            # 可复用组件
│   ├── screen-container.tsx
│   └── schedule-table.tsx
├── lib/                   # 工具和上下文
│   ├── auth-context.tsx
│   ├── schedule-context.tsx
│   └── trpc.ts
├── BUILD_APK.md          # APK 构建指南
└── eas.json              # EAS Build 配置
```

### 修改应用

1. **编辑主屏幕**: `app/(tabs)/index.tsx`
2. **修改样式**: 编辑 Tailwind CSS 类名
3. **添加新屏幕**: 在 `app/` 目录创建新文件

### 热重载

修改代码后，应用会自动重新加载。

## 🚀 构建生产版本

### 使用 EAS Build（推荐）

```bash
export EXPO_TOKEN="Bu4oDKJ52syZn-pygZqo2IQQy0V1eDL9nX9x8Jfn"
eas build --platform android --wait
```

构建完成后，访问 https://expo.dev/accounts/jiang_nan/projects/zju-schedule-app/builds 下载 APK。

### 使用本地 Android SDK

详见 [BUILD_APK.md](BUILD_APK.md) 的"方法 2"部分。

## 📖 更多资源

- [Expo 官方文档](https://docs.expo.dev/)
- [React Native 文档](https://reactnative.dev/)
- [项目 GitHub](https://github.com/Jiangnan726/zju-schedule-app)

## 🐛 常见问题

### Q: 应用无法启动？
A: 确保您已安装所有依赖：
```bash
cd /home/ubuntu/zju-schedule-app
pnpm install
```

### Q: 无法连接到开发服务器？
A: 检查防火墙设置，确保 8081 端口未被占用。

### Q: 如何在真实设备上测试？
A: 使用 Expo Go 应用扫描 QR 码，或生成 APK 文件直接安装。

## 📝 许可证

MIT License

## 📧 联系方式

如有问题或建议，请在 GitHub 上提交 Issue。
