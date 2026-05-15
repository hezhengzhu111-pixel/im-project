# Mobile Release Scope — First Phase

## Core Principle

> **"功能代码存在"不等于"发布验证通过"。**
>
> parity matrix 中标记为 `DONE` 的功能仅表示代码已编写并通过 typecheck / 单测，不代表已在真机上完成端到端验证或达到发布级别。

## First-Phase Target

当前第一阶段以 **Android debug 联调** 和 **Android release 内测准备** 为主。

| 平台 | 阶段定位 | Release-Ready |
|------|---------|---------------|
| Android | 优先平台，唯一内测候选 | 否（有阻塞项） |
| iOS | 工程存在，不在当前发布范围 | 否 |

## Android — Priority Platform

Android 是当前唯一进入内测的候选平台。当前状态：

### What's Working

- debug APK 构建、安装、启动
- typecheck / 单测 / lint 全部通过
- parity matrix 中 83 项 DONE、12 项 PARTIAL
- 登录页可正常展示（用户名/密码输入框和登录按钮已显示）

### Blocking Items for Internal Testing

以下 3 项阻塞 Android 进入内测发布阶段：

| # | 阻塞项 | 当前状态 | 需要什么 |
|---|--------|---------|---------|
| 1 | release signing 变量 | 4 个变量未提供，`assembleRelease` / `bundleRelease` 均失败 | 提供 keystore 文件和 4 个签名环境变量 |
| 2 | 登录链路真实验证 | 登录页显示 `Network unavailable` 告警，未完成真实登录 | 排查网络状态判定 + 提供测试账号执行真实登录 |
| 3 | 私聊/群聊/媒体/pending/WebSocket 端到端验证 | 受登录未打通影响，核心 IM 主链路无发布级证据 | 登录打通后执行端到端冒烟 |

### What Can Continue Now

- debug 联调（模拟器 + LAN 物理设备）
- 单测和 typecheck 持续验证
- 登录链路问题排查

### What Cannot Proceed

- release APK / AAB 内测分发
- Play Console 上传
- 外部内测人员分发

## iOS — Not Release-Ready

iOS 工程文件存在于 `apps/mobile/ios/`，但 **当前不应默认视为 release-ready**。

### What Exists

- Xcode 项目文件（结构兼容）
- React Native 代码共享（JS/TS 层与 Android 共用）

### What Needs Separate Completion

iOS 需单独完成以下工作后才能进入发布评估：

| # | 待办事项 | 说明 |
|---|---------|------|
| 1 | 权限声明 | Info.plist 中的相机、麦克风、相册、通知等 `NSUsageDescription` 配置 |
| 2 | native runtime config | iOS 等价于 Android `BuildConfig` 的环境注入机制（如 xcconfig 或 Info.plist 注入） |
| 3 | 推送配置 | APNs entitlements、推送证书 / token 配置、`@react-native-firebase/messaging` iOS 初始化 |
| 4 | 真机冒烟 | 物理 iOS 设备上的启动、登录、消息收发验证 |
| 5 | archive / TestFlight 验证 | Xcode archive 构建、TestFlight 上传、外部测试分发验证 |

### iOS Is NOT In Scope For

- 当前阶段的内测发布
- 当前门禁报告的评估范围
- 与 Android 共用发布 timeline 的假设

## Related Documents

- `ANDROID_RELEASE_GATE_REPORT.md` — Android 门禁报告（详细阻塞项分析）
- `ANDROID_RUNBOOK.md` — Android 构建与运行指南
- `MOBILE_PARITY_MATRIX.md` — Web 功能到移动端的实现对照表
