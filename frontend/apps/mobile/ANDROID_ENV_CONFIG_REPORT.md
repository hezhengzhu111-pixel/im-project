# Android Environment Config Report

## 1. Scope

- Add Android environment layering for `frontend/apps/mobile`
- Keep React Native CLI architecture unchanged
- Keep debug emulator default behavior available
- Avoid hardcoding production endpoints in source control

## 2. Supported Environments

- `dev-emulator`: default `10.0.2.2`
- `dev-device`: physical Android device over LAN
- `sit`: SIT gateway
- `prod`: production placeholder injected externally

Release builds also accept `internal` / `debug` as explicit internal-only bypass values when keeping emulator URLs on purpose.

## 3. Injection Strategy

Android accepts these Gradle properties or environment variables:

- `IM_MOBILE_APP_ENV`
- `IM_MOBILE_API_BASE_URL`
- `IM_MOBILE_WS_BASE_URL`
- `IM_MOBILE_FILE_BASE_URL`

Native export path:

1. Gradle resolves and validates the values
2. Values are written into Android `BuildConfig`
3. A lightweight RN `ConfigModule` exposes them synchronously to JS
4. JS resolves final config with this priority:
   - runtime injected config
   - env / native config
   - built-in `dev-emulator` fallback

## 4. URL Validation

- `API_BASE_URL` / `FILE_BASE_URL`: `http://` or `https://`
- `WS_BASE_URL`: `ws://` or `wss://`
- Invalid JS-side values are ignored with warnings and fall back to the next source
- Invalid Gradle-side values fail the Android build immediately

## 5. Release Safeguard

- Debug builds may continue to use the default emulator URLs
- Release builds must not silently use `10.0.2.2`
- If a release build still resolves to emulator fallback URLs, Gradle fails fast unless `IM_MOBILE_APP_ENV=internal` or `debug` is explicitly provided

## 6. Files Added or Updated

- `src/constants/runtimeConfig.ts`
- `src/constants/config.ts`
- `src/constants/config.test.ts`
- `android/app/build.gradle`
- `android/gradle.properties`
- `android/app/src/main/java/com/immobile/ConfigModule.kt`
- `android/app/src/main/java/com/immobile/ConfigPackage.kt`
- `android/app/src/main/java/com/immobile/MainApplication.kt`
- `.env.example`
- `README.md`
- `ANDROID_RUNBOOK.md`

## 7. Validation Plan

- Config default value test
- Config priority test
- URL validation fallback test
- Release fallback warning test
- `mobile:typecheck`
- `mobile:test`
- `mobile:lint`
- `mobile:clean`

## 8. Validation Results

- `cd frontend && npm run mobile:typecheck`: PASS
- `cd frontend && npm run mobile:test`: PASS
- `cd frontend && npm run mobile:lint`: PASS
- `cd frontend && npm run mobile:clean`: BLOCKED
  - Failure is not caused by the new config layering logic
  - Current blocker remains Windows native clean for `react-native-worklets`
  - Observed error: `:app:externalNativeBuildCleanDebug` -> `ninja: fatal: GetOverlappedResult`

## 9. 常见失败原因

### 9.1 缺少 release signing 变量

**现象**：`assembleRelease` 或 `bundleRelease` 在 Gradle 配置阶段直接失败，报错类似 `Required release signing variable IM_MOBILE_RELEASE_STORE_FILE is not set`。

**原因**：Release 构建要求 4 个签名变量全部存在：

| 变量 | 说明 |
|------|------|
| `IM_MOBILE_RELEASE_STORE_FILE` | keystore 文件绝对路径 |
| `IM_MOBILE_RELEASE_STORE_PASSWORD` | keystore 密码 |
| `IM_MOBILE_RELEASE_KEY_ALIAS` | key alias |
| `IM_MOBILE_RELEASE_KEY_PASSWORD` | key 密码 |

**解决**：在当前 shell 中 export（Linux/macOS）或 `$env:`（PowerShell）所有 4 个变量。

### 9.2 Keystore 文件路径不存在

**现象**：Gradle 报错找不到 keystore 文件，即使签名变量已设置。

**原因**：`IM_MOBILE_RELEASE_STORE_FILE` 指向的文件不存在，常见原因包括路径拼写错误、使用了相对路径（应使用绝对路径）、keystore 文件未从安全存储复制到本机。

**解决**：确认路径为绝对路径，确认文件确实存在于该路径。

### 9.3 Release 环境仍使用 10.0.2.2

**现象**：Release 构建失败，Gradle 报错 release 不允许使用 `10.0.2.2`。

**原因**：`10.0.2.2` 是 Android Emulator 的宿主机 loopback 地址，仅适用于 debug 构建。Release 构建默认禁止静默使用该地址（见第 5 节 Release Safeguard）。

**解决**：设置 `IM_MOBILE_APP_ENV` 为 `sit`、`prod` 或其他非 emulator 值，并提供真实的 `IM_MOBILE_API_BASE_URL`、`IM_MOBILE_WS_BASE_URL`、`IM_MOBILE_FILE_BASE_URL`。如需内部调试 release 包，可显式设置 `IM_MOBILE_APP_ENV=internal` 或 `debug`。

### 9.4 Firebase 配置缺失

**现象**：Gradle 构建警告 `google-services.json` 缺失，或 App 运行时 FCM token 为空。

**原因**：`apps/mobile/android/app/google-services.json` 不存在或不是当前项目的配置文件。

**影响**：本地 debug 不阻塞，App 会降级为空 FCM token + Notifee 本地通知。但 release 前如果需要离线推送功能，必须确认 Firebase 配置就绪。

**解决**：在 `apps/mobile/android/app/` 下放置正确的 `google-services.json`，确认 Android 包名与 Firebase 项目注册的包名一致，确认签名证书的 SHA 指纹已在 Firebase 控制台注册。不要将真实的 `google-services.json` 提交到版本控制。
