# ZJU 课表助手 - Android APK 构建指南

本文档提供了多种方式来为 ZJU 课表助手应用生成可安装的 Android APK 文件。

## 方法 1: 使用 Expo EAS Build（推荐）

### 前置条件
- Expo 账户（已有）
- Expo CLI 已安装
- EAS CLI 已安装

### 步骤

1. **登录 Expo 账户**
   ```bash
   export EXPO_TOKEN="Bu4oDKJ52syZn-pygZqo2IQQy0V1eDL9nX9x8Jfn"
   ```

2. **配置 Android 凭证**
   访问 https://expo.dev/accounts/jiang_nan/projects/zju-schedule-app/credentials
   - 点击 "Android" 标签
   - 点击 "Generate new keystore"
   - 按照提示完成配置

3. **构建 APK**
   ```bash
   cd /home/ubuntu/zju-schedule-app
   export EXPO_TOKEN="Bu4oDKJ52syZn-pygZqo2IQQy0V1eDL9nX9x8Jfn"
   eas build --platform android --wait
   ```

4. **下载 APK**
   - 构建完成后，访问 https://expo.dev/accounts/jiang_nan/projects/zju-schedule-app/builds
   - 找到最新的 Android 构建
   - 点击下载 APK 文件

## 方法 2: 使用本地 Android SDK

### 前置条件
- Android SDK 已安装
- Java JDK 11+ 已安装
- 环境变量已配置

### 步骤

1. **安装依赖**
   ```bash
   cd /home/ubuntu/zju-schedule-app
   pnpm install
   ```

2. **生成 Keystore**
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
   ```

3. **配置 Gradle**
   编辑 `android/app/build.gradle` 添加签名配置

4. **构建 APK**
   ```bash
   npx expo prebuild --clean
   cd android
   ./gradlew assembleRelease
   ```

5. **APK 文件位置**
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

## 方法 3: 使用 Expo Go 进行开发测试

如果您只想在设备上测试应用，可以使用 Expo Go：

1. **在 Android 设备上安装 Expo Go**
   - 从 Google Play Store 下载 "Expo Go"

2. **启动开发服务器**
   ```bash
   cd /home/ubuntu/zju-schedule-app
   pnpm dev
   ```

3. **扫描 QR 码**
   - 在 Expo Go 中扫描终端显示的 QR 码
   - 应用将在您的设备上加载

## 项目信息

- **EAS 项目 ID**: 93dd300b-e1b6-4ffe-a4d3-55198a81c7a7
- **Expo 用户名**: jiang_nan
- **项目 Slug**: zju-schedule-app
- **应用名称**: ZJU 课表

## 常见问题

### Q: 为什么 EAS Build 需要交互式输入？
A: EAS Build 需要您在第一次构建时生成 Android 签名密钥。您可以在 Expo 网站上预先配置这些凭证。

### Q: 如何获取已构建的 APK？
A: 访问 https://expo.dev/accounts/jiang_nan/projects/zju-schedule-app/builds 查看所有构建，并下载相应的 APK 文件。

### Q: 应用可以直接安装在 Android 手机上吗？
A: 是的，生成的 APK 文件可以直接在 Android 手机上安装。只需下载 APK 文件并在手机上打开即可。

## 获取帮助

- Expo 文档: https://docs.expo.dev/
- EAS Build 文档: https://docs.expo.dev/build/introduction/
- GitHub 仓库: https://github.com/Jiangnan726/zju-schedule-app
