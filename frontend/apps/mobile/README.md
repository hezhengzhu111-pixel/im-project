# @im/mobile

Android-first Bare React Native client for the IM workspace.

## Scope

- Package: `@im/mobile`
- Path: `frontend/apps/mobile`
- React Native CLI, not Expo Go and not WebView/Capacitor.
- Android is the validation target for this phase. iOS project files are kept structurally compatible but are not a release gate here.
- E2EE is intentionally deferred. Encrypted messages are masked and encrypted-session sending is blocked instead of faking encryption.

## First-Phase Platform Scope

> **"功能代码存在"不等于"发布验证通过"。** 本文档和 parity matrix 中标记为 `DONE` 的功能仅表示代码已编写并通过 typecheck / 单测，不代表已在真机上完成端到端验证或达到发布级别。

### Android — 优先平台

当前第一阶段以 **Android debug 联调** 和 **Android release 内测准备** 为主。Android 是唯一进入内测的候选平台。

当前进入内测的阻塞项（详见 `ANDROID_RELEASE_GATE_REPORT.md` 和 `MOBILE_RELEASE_SCOPE.md`）：

1. **release signing 变量未提供** — `assembleRelease` / `bundleRelease` 均无法构建
2. **登录链路未完成真实验证** — 登录页存在 `Network unavailable` 告警，未执行真实登录
3. **私聊 / 群聊 / 媒体 / pending / WebSocket 端到端未通过** — 受登录未打通影响，核心 IM 主链路无发布级证据

### iOS — 尚未 Release-Ready

iOS 工程文件存在（`apps/mobile/ios/`），但 **当前不应默认视为 release-ready**。iOS 需要单独完成以下工作后才能进入发布评估：

- 权限声明（Info.plist 中的相机、麦克风、相册、通知等）
- native runtime config（BuildConfig 等价注入）
- 推送配置（APNs entitlements + 证书 / token）
- 真机冒烟测试
- archive / TestFlight 验证

iOS 不在当前阶段的发布范围内。

## Commands

Run from `frontend/`:

```bash
npm install
npm run mobile:start
npm run mobile:reverse
npm run mobile:android
npm run mobile:typecheck
npm run mobile:test
npm run mobile:lint
npm run mobile:clean
```

Keep `mobile:start` running in its own terminal. `mobile:android` does not start Metro; this avoids the React Native CLI port prompt when Metro is already listening on 8081. The Android script discovers the SDK from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `apps/mobile/android/local.properties` and injects `platform-tools` into PATH for `adb`.

## Runtime Config

Mobile now supports four runtime environments:

- `dev-emulator`: default Android Emulator loopback (`10.0.2.2`)
- `dev-device`: LAN IP for a physical Android device
- `sit`: SIT gateway
- `prod`: production placeholder, injected outside the repo

JS config priority is:

1. Runtime injected config (`globalThis.IM_MOBILE_RUNTIME_CONFIG`)
2. Environment variables / native Android `BuildConfig` injection
3. Built-in `dev-emulator` fallback

Preferred injection keys:

```bash
IM_MOBILE_APP_ENV=dev-emulator
IM_MOBILE_API_BASE_URL=http://10.0.2.2:8082/api
IM_MOBILE_WS_BASE_URL=ws://10.0.2.2:8082
IM_MOBILE_FILE_BASE_URL=http://10.0.2.2:8082
```

Legacy JS-side keys remain supported for local overrides:

```bash
API_BASE_URL=http://10.0.2.2:8082/api
WS_BASE_URL=ws://10.0.2.2:8082
FILE_BASE_URL=http://10.0.2.2:8082
```

Validation rules:

- `API_BASE_URL` / `FILE_BASE_URL` must use `http://` or `https://`
- `WS_BASE_URL` must use `ws://` or `wss://`
- Invalid values are ignored and fall back to the next lower-priority source with a warning
- Release builds are not allowed to keep the default `10.0.2.2` URLs unless `IM_MOBILE_APP_ENV=internal` or `debug` is explicitly set for an internal-only release

Typical usage:

```bash
# Android Emulator
IM_MOBILE_APP_ENV=dev-emulator
IM_MOBILE_API_BASE_URL=http://10.0.2.2:8082/api
IM_MOBILE_WS_BASE_URL=ws://10.0.2.2:8082
IM_MOBILE_FILE_BASE_URL=http://10.0.2.2:8082

# Physical device on LAN
IM_MOBILE_APP_ENV=dev-device
IM_MOBILE_API_BASE_URL=http://192.168.x.x:8082/api
IM_MOBILE_WS_BASE_URL=ws://192.168.x.x:8082
IM_MOBILE_FILE_BASE_URL=http://192.168.x.x:8082
```

## Implemented Client Areas

- Auth/session restore with Keychain token storage, cookie mirroring, refresh coordinator, 401 retry, and session generation guard.
- Real HTTP services for auth, user, friends, groups, messages, files, moments, AI settings, and logs.
- Session IDs are resolved through `@im/shared-im-core` (`buildSessionId` / message session resolver). Mobile no longer hand-builds private or group conversation IDs.
- Backend DTO parsing goes through `@im/shared-normalizers`; mobile keeps adapter-only conversion for `MobileMessage`, `ChatSession`, and local storage view models.
- Message identity and merge behavior reuse `@im/shared-im-core` helpers before writing Zustand state or SQLite.
- Zustand stores for auth, user, chat, sessions, messages, contacts, groups, settings, websocket, moments, notifications, and uploads.
- SQLite-backed message/session/pending/upload repositories with in-memory fallback when native SQLite is unavailable.
- Offline pending-message retry with exponential backoff and upload task state.
- Ticketed WebSocket connection, heartbeat, reconnect, event dispatch, dedupe, foreground/background hooks, and notification triggers.
- Notifee local notification adapter and Firebase Messaging token adapter.
- Android permission module for camera, media, microphone, notifications, and file access.
- Native mobile navigation: auth stack, chat/contact/group stacks, moments stack, profile/settings stack.

## Documents

- `MOBILE_RELEASE_SCOPE.md` — **首阶段平台范围说明**：Android 优先、iOS 尚未 release-ready、阻塞项清单。
- `MOBILE_PARITY_MATRIX.md` maps Web features to mobile implementation status.
- `ANDROID_RELEASE_GATE_REPORT.md` — Android release 门禁报告（NO-GO，含详细阻塞项分析）。
- `LOCAL_STORAGE_DESIGN.md` describes Keychain, MMKV, SQLite, cache cleanup, logout cleanup, pending queue, and upload queue.
- `PUSH_BACKEND_CONTRACT.md` defines missing server push-device endpoints.
- `ANDROID_RUNBOOK.md` describes Android setup, runtime URLs, permissions, FCM placeholders, and common build issues.
- `MOBILE_ANDROID_FIX_REPORT.md` records Android core fix scope, verification, and remaining release checklist.
- `ANDROID_ENV_CONFIG_REPORT.md` records the Android environment layering design, validation strategy, and release safeguards.

## Firebase / FCM Local Development

FCM is optional for local debug. If `apps/mobile/android/app/google-services.json` is absent or Firebase Messaging is unavailable, the app logs a warning, returns an empty FCM token, and continues with Notifee local notifications. Offline push still requires a local Firebase config plus the backend push-device APIs documented in `PUSH_BACKEND_CONTRACT.md`.

Do not commit a real `google-services.json`.

## Android Release Notes

Debug builds allow cleartext traffic for emulator and LAN backend testing. Release builds default `usesCleartextTraffic=false`, read `IM_MOBILE_VERSION_CODE` / `IM_MOBILE_VERSION_NAME`, and use release signing only when the `IM_MOBILE_RELEASE_*` keystore variables are provided.

The repo intentionally does not commit real production endpoints, signing secrets, or keystore files.

### Release Signing Variables

Release APK 和 AAB 构建必须提供以下 4 个签名变量，缺少任何一个 Gradle 都会在配置阶段直接 fail-fast：

| 变量 | 说明 |
|------|------|
| `IM_MOBILE_RELEASE_STORE_FILE` | keystore 文件的绝对路径 |
| `IM_MOBILE_RELEASE_STORE_PASSWORD` | keystore 密码 |
| `IM_MOBILE_RELEASE_KEY_ALIAS` | key alias 名称 |
| `IM_MOBILE_RELEASE_KEY_PASSWORD` | key 密码 |

### Release 构建命令

APK 构建（Linux / macOS）：

```bash
cd frontend/apps/mobile/android
./gradlew assembleRelease
```

APK 构建（Windows）：

```powershell
cd frontend\apps\mobile\android
.\gradlew.bat assembleRelease
```

AAB 构建（Linux / macOS）：

```bash
cd frontend/apps/mobile/android
./gradlew bundleRelease
```

AAB 构建（Windows）：

```powershell
cd frontend\apps\mobile\android
.\gradlew.bat bundleRelease
```

Expected artifacts:

- APK: `frontend/apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- AAB: `frontend/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`

### Release 环境地址变量

Release 构建必须显式注入以下 4 个环境地址变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `IM_MOBILE_APP_ENV` | 环境标识 | `sit` / `prod` |
| `IM_MOBILE_API_BASE_URL` | HTTP API 地址 | `https://sit.example.invalid/api` |
| `IM_MOBILE_WS_BASE_URL` | WebSocket 地址 | `wss://sit.example.invalid` |
| `IM_MOBILE_FILE_BASE_URL` | 文件服务地址 | `https://sit.example.invalid` |

**Release 构建禁止静默使用 `10.0.2.2`**。如果 release 构建仍解析到 `10.0.2.2`，Gradle 会直接 fail，除非显式设置 `IM_MOBILE_APP_ENV=internal` 或 `debug`（仅用于内部调试验证）。

### Release 签名与环境注入示例

Linux / macOS 示例：

```bash
export IM_MOBILE_RELEASE_STORE_FILE="$HOME/secure/im-mobile-release.jks"
export IM_MOBILE_RELEASE_STORE_PASSWORD="replace-me"
export IM_MOBILE_RELEASE_KEY_ALIAS="im-mobile"
export IM_MOBILE_RELEASE_KEY_PASSWORD="replace-me"

export IM_MOBILE_APP_ENV="sit"
export IM_MOBILE_API_BASE_URL="https://sit.example.invalid/api"
export IM_MOBILE_WS_BASE_URL="wss://sit.example.invalid"
export IM_MOBILE_FILE_BASE_URL="https://sit.example.invalid"

cd frontend/apps/mobile/android
./gradlew assembleRelease
```

Windows PowerShell 示例：

```powershell
$env:IM_MOBILE_RELEASE_STORE_FILE="C:\secure\im-mobile-release.jks"
$env:IM_MOBILE_RELEASE_STORE_PASSWORD="replace-me"
$env:IM_MOBILE_RELEASE_KEY_ALIAS="im-mobile"
$env:IM_MOBILE_RELEASE_KEY_PASSWORD="replace-me"

$env:IM_MOBILE_APP_ENV="sit"
$env:IM_MOBILE_API_BASE_URL="https://sit.example.invalid/api"
$env:IM_MOBILE_WS_BASE_URL="wss://sit.example.invalid"
$env:IM_MOBILE_FILE_BASE_URL="https://sit.example.invalid"

cd frontend\apps\mobile\android
.\gradlew.bat assembleRelease
```

### 常见失败原因

#### 1. 缺少 release signing 变量

**现象**：`assembleRelease` 或 `bundleRelease` 在 Gradle 配置阶段直接失败，报错类似 `Required release signing variable IM_MOBILE_RELEASE_STORE_FILE is not set`。

**原因**：Release 构建要求 4 个签名变量全部存在。

**解决**：在当前 shell 中 export（Linux/macOS）或 `$env:`（PowerShell）所有 4 个变量。

#### 2. Keystore 文件路径不存在

**现象**：Gradle 报错找不到 keystore 文件，即使签名变量已设置。

**原因**：`IM_MOBILE_RELEASE_STORE_FILE` 指向的文件不存在，常见原因包括路径拼写错误、使用了相对路径（应使用绝对路径）、keystore 文件未从安全存储复制到本机。

**解决**：确认路径为绝对路径，确认文件确实存在于该路径。

#### 3. Release 环境仍使用 10.0.2.2

**现象**：Release 构建失败，Gradle 报错 release 不允许使用 `10.0.2.2`。

**原因**：`10.0.2.2` 是 Android Emulator 的宿主机 loopback 地址，仅适用于 debug 构建。Release 构建默认禁止静默使用该地址。

**解决**：设置 `IM_MOBILE_APP_ENV` 为 `sit`、`prod` 或其他非 emulator 值，并提供真实的 `IM_MOBILE_API_BASE_URL`、`IM_MOBILE_WS_BASE_URL`、`IM_MOBILE_FILE_BASE_URL`。如需内部调试 release 包，可显式设置 `IM_MOBILE_APP_ENV=internal` 或 `debug`。

#### 4. Firebase 配置缺失

**现象**：Gradle 构建警告 `google-services.json` 缺失，或 App 运行时 FCM token 为空。

**原因**：`apps/mobile/android/app/google-services.json` 不存在或不是当前项目的配置文件。

**影响**：本地 debug 不阻塞，App 会降级为空 FCM token + Notifee 本地通知。但 release 前如果需要离线推送功能，必须确认 Firebase 配置就绪。

**解决**：在 `apps/mobile/android/app/` 下放置正确的 `google-services.json`，确认 Android 包名与 Firebase 项目注册的包名一致，确认签名证书的 SHA 指纹已在 Firebase 控制台注册。不要将真实的 `google-services.json` 提交到版本控制。

## E2EE Degradation

Mobile does not call Web E2EE code, does not create a fake E2EE manager, does not send `encrypted=true`, and does not call encrypted-send APIs. Received encrypted messages are rendered as unsupported:

> 此端到端加密消息暂不能在移动端查看，请在 Web 端查看。

Encrypted sessions block sending:

> 移动端暂不支持端到端加密会话发送，请切换到 Web 端或关闭加密通道。
