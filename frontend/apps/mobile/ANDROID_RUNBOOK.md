# Android Runbook

## Prerequisites

- Node.js 22 or newer.
- npm workspaces from `frontend/`.
- JDK 17 available to Gradle toolchains. This app's wrapper uses a Gradle mirror to avoid GitHub release download failures in restricted networks.
- Android Studio with Android SDK, platform tools, emulator, a recent Android platform, Android SDK Build-Tools, NDK 27.1.12297006, and CMake 3.22.1 installed.
- `ANDROID_HOME` or `ANDROID_SDK_ROOT` configured.

## Install

```bash
cd frontend
npm install
```

## Start Metro

```bash
cd frontend
npm run mobile:start
```

Keep this terminal open. `mobile:android` wraps `react-native run-android --no-packager`, so it installs and launches the app without starting a second Metro process. The wrapper checks whether Metro is reachable at `127.0.0.1:8081`, prints a clear warning when it is not running, and attempts `adb reverse tcp:8081 tcp:8081` before and after launch for connected devices. It also prepends the Android SDK `platform-tools` path discovered from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `apps/mobile/android/local.properties`, so `adb` does not need to be globally configured.

When Metro is running but the app shows `Unable to load script`, configure Android port forwarding:

```bash
cd frontend
npm run mobile:reverse
```

This script locates `adb` from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `apps/mobile/android/local.properties`.

## Run Android

In another terminal:

```bash
cd frontend
npm run mobile:android
```

If you restart the emulator or reconnect a physical device, `npm run mobile:android` attempts to restore `adb reverse` automatically. You can still run `npm run mobile:reverse` manually before tapping Reload on an already-open red error screen.

## Environment Layers

Android runtime config supports these environments:

- `dev-emulator`: default emulator loopback, safe fallback for debug
- `dev-device`: physical device over LAN
- `sit`: SIT gateway
- `prod`: production placeholder, injected outside source control

Release builds must not silently fall back to `10.0.2.2`. If a release build still resolves to emulator URLs, Gradle fails the build unless `IM_MOBILE_APP_ENV=internal` or `debug` is explicitly set for an internal-only release.

Injection keys:

```bash
IM_MOBILE_APP_ENV
IM_MOBILE_API_BASE_URL
IM_MOBILE_WS_BASE_URL
IM_MOBILE_FILE_BASE_URL
```

JS config priority:

1. Runtime injected config
2. Environment variables / native Android `BuildConfig`
3. Built-in `dev-emulator` fallback

Validation:

- `IM_MOBILE_API_BASE_URL`: `http://` or `https://`
- `IM_MOBILE_WS_BASE_URL`: `ws://` or `wss://`
- `IM_MOBILE_FILE_BASE_URL`: `http://` or `https://`

## Android Emulator

Default debug behavior already points to the emulator loopback. You can still set it explicitly:

```bash
IM_MOBILE_APP_ENV=dev-emulator
IM_MOBILE_API_BASE_URL=http://10.0.2.2:8082/api
IM_MOBILE_WS_BASE_URL=ws://10.0.2.2:8082
IM_MOBILE_FILE_BASE_URL=http://10.0.2.2:8082
```

PowerShell example:

```bash
$env:IM_MOBILE_APP_ENV="dev-emulator"
$env:IM_MOBILE_API_BASE_URL="http://10.0.2.2:8082/api"
$env:IM_MOBILE_WS_BASE_URL="ws://10.0.2.2:8082"
$env:IM_MOBILE_FILE_BASE_URL="http://10.0.2.2:8082"
cd frontend
npm run mobile:android
```

## Physical Device

Use the LAN IP of the machine running the backend:

```bash
IM_MOBILE_APP_ENV=dev-device
IM_MOBILE_API_BASE_URL=http://192.168.x.x:8082/api
IM_MOBILE_WS_BASE_URL=ws://192.168.x.x:8082
IM_MOBILE_FILE_BASE_URL=http://192.168.x.x:8082
```

The phone and backend machine must be on the same reachable network. Firewalls must allow ports 8082 and the WebSocket endpoint.

PowerShell example:

```bash
$env:IM_MOBILE_APP_ENV="dev-device"
$env:IM_MOBILE_API_BASE_URL="http://192.168.x.x:8082/api"
$env:IM_MOBILE_WS_BASE_URL="ws://192.168.x.x:8082"
$env:IM_MOBILE_FILE_BASE_URL="http://192.168.x.x:8082"
cd frontend
npm run mobile:android
```

## SIT

Use the SIT gateway values provided by deployment or QA:

```bash
IM_MOBILE_APP_ENV=sit
IM_MOBILE_API_BASE_URL=https://sit.example.invalid/api
IM_MOBILE_WS_BASE_URL=wss://sit.example.invalid
IM_MOBILE_FILE_BASE_URL=https://sit.example.invalid
```

PowerShell example:

```bash
$env:IM_MOBILE_APP_ENV="sit"
$env:IM_MOBILE_API_BASE_URL="https://sit.example.invalid/api"
$env:IM_MOBILE_WS_BASE_URL="wss://sit.example.invalid"
$env:IM_MOBILE_FILE_BASE_URL="https://sit.example.invalid"
cd frontend
npm run mobile:android
```

## Release / Prod

Release builds must inject addresses explicitly:

```bash
$env:IM_MOBILE_APP_ENV="prod"
$env:IM_MOBILE_API_BASE_URL="https://prod.example.invalid/api"
$env:IM_MOBILE_WS_BASE_URL="wss://prod.example.invalid"
$env:IM_MOBILE_FILE_BASE_URL="https://prod.example.invalid"
cd frontend\apps\mobile\android
.\gradlew.bat assembleRelease
```

Notes:

- Do not commit real production endpoints, signing secrets, or environment-specific files.
- If you intentionally need an internal-only release build against emulator URLs, set `IM_MOBILE_APP_ENV=internal` or `debug` explicitly. Otherwise the Gradle build fails fast.

## Permissions

The Android manifest declares:

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `CAMERA`
- `RECORD_AUDIO`
- `POST_NOTIFICATIONS`
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_VIDEO`
- `READ_MEDIA_AUDIO`
- `READ_MEDIA_VISUAL_USER_SELECTED`
- legacy external storage permissions with SDK guards
- `VIBRATE`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MICROPHONE`

Runtime permission behavior:

- Camera is requested before photo capture.
- Android 13+ mixed media selection requests both image and video read permissions before opening the picker.
- Media/file permissions are requested before selecting or reading local files when Android requires it.
- Microphone is requested before recording voice messages.
- Android 13+ notification permission is requested before system notifications.
- Denied permissions show a user-facing message path and can open system settings through the platform service.

## Media Validation Notes

### Android 12 and below

- Gallery / video picker: `READ_EXTERNAL_STORAGE`
- Camera: `CAMERA`
- Voice record: `RECORD_AUDIO`

### Android 13

- Images: `READ_MEDIA_IMAGES`
- Videos: `READ_MEDIA_VIDEO`
- Audio files: `READ_MEDIA_AUDIO`
- Chat media picker now requests both image and video permissions when opening the mixed picker

### Android 14+

- Uses the Android 13 media permissions plus `READ_MEDIA_VISUAL_USER_SELECTED`
- If the user only grants selected photos/videos access, the system picker route still works and the app does not bypass permission prompts

### Media Send Chain

- Photo / video:
  - `+` opens the mixed media picker
  - `Cam` opens the camera
- File:
  - `File` opens the document picker
  - `content://` documents are copied into app cache when needed before upload
- Voice:
  - `Voice` starts recording
  - `Stop` stops recording and sends a `VOICE` message

### Media Bubble Behavior

- `IMAGE`: inline preview
- `VIDEO`: inline `react-native-video` player with native controls
- `VOICE`: play / stop action
- `FILE`: open-file action

### Upload Reliability

- Media messages insert a local pending message first
- Upload success updates:
  - local message `mediaUrl`
  - local `thumbnailUrl`
  - local file name / file size
  - persisted pending payload
- Retry reuses the same upload task for the same local message instead of creating duplicates

## FCM Placeholder and Local Degradation

Firebase Messaging client code is present, but FCM is optional for local debug. Without `google-services.json`, Firebase Messaging may be unavailable; the app catches that condition, logs a warning, returns an empty FCM token, and keeps Notifee local notifications working.

A real offline push setup requires Android Firebase configuration:

- Add `google-services.json` under `apps/mobile/android/app/`.
- Configure the Firebase Android app id/package.
- Add backend push device endpoints described in `PUSH_BACKEND_CONTRACT.md`.

Do not commit real Firebase secrets or environment-specific files unless the repository policy explicitly allows them.

Backend push-device APIs are still `BACKEND_REQUIRED`, so local development should treat FCM as token-adapter-only until those APIs exist.

## Debug and Release Build Configuration

- Debug builds set `usesCleartextTraffic=true` for `10.0.2.2` and LAN backend testing.
- Release builds set `usesCleartextTraffic=false` by default.
- Android native config is exported through `BuildConfig` and a lightweight RN `ConfigModule`.
- Runtime addresses can be injected through Gradle properties or environment variables:
  - `IM_MOBILE_APP_ENV`
  - `IM_MOBILE_API_BASE_URL`
  - `IM_MOBILE_WS_BASE_URL`
  - `IM_MOBILE_FILE_BASE_URL`
- Version values can be overridden with Gradle properties or environment variables:
  - `IM_MOBILE_VERSION_CODE`
  - `IM_MOBILE_VERSION_NAME`
- Release signing is intentionally environment-driven:
  - `IM_MOBILE_RELEASE_STORE_FILE`
  - `IM_MOBILE_RELEASE_STORE_PASSWORD`
  - `IM_MOBILE_RELEASE_KEY_ALIAS`
  - `IM_MOBILE_RELEASE_KEY_PASSWORD`
- `IM_MOBILE_MINIFY_RELEASE=true` can enable release minification later; it remains off by default for this phase.

## Common Build Issues

`SDK location not found`:

- Set `ANDROID_HOME` or create `apps/mobile/android/local.properties` with `sdk.dir=...`.
- Do not commit `local.properties`.

`Failed to install build-tools;36.0.0` or `ZipFile unknown archive`:

- Delete the partial SDK folder, for example `Android/Sdk/build-tools/36.0.0` if it only contains `.installer`.
- Reinstall Android SDK Build-Tools from Android Studio SDK Manager.
- The mobile Gradle project intentionally does not pin `buildToolsVersion`; Android Gradle Plugin will select a compatible installed Build Tools package.

`Failed to install cmake;3.22.1` or `react-native-gesture-handler ... failed to configure C/C++`:

- Install CMake 3.22.1 from Android Studio SDK Manager.
- Confirm `Android/Sdk/cmake/3.22.1/bin/cmake --version` works.
- Keep the NDK version aligned with `ndkVersion` in `apps/mobile/android/build.gradle`.

`No connected devices`:

- Start an emulator from Android Studio or connect a USB device with debugging enabled.

`Unable to load script` on the red React Native error screen:

- Start Metro with `npm run mobile:start -- --reset-cache`.
- Run `npm run mobile:reverse` after the emulator/device is connected.
- If using a physical device over Wi-Fi instead of USB reverse, open the React Native dev menu and set the debug server host to `<computer LAN IP>:8081`.
- If running a release APK, build a release bundle; debug APKs are expected to load JavaScript from Metro.

`Java version mismatch` or Gradle toolchain download hangs:

- Install JDK 17 or make it visible through `org.gradle.java.installations.paths`.
- If `services.gradle.org` redirects to a blocked GitHub release download, keep the committed Gradle wrapper mirror or switch to another reachable Gradle distribution mirror.

`google-services.json missing`:

- FCM is optional for local development until server push is implemented.
- If Gradle plugin configuration is later added, provide a development Firebase config locally.

`10.0.2.2 connection refused`:

- Ensure `api-server-rs` is running on the host and bound to a reachable interface.
- Confirm the URL includes `/api` for HTTP calls.
- Confirm the app is using the expected environment injection keys and not stale values from an earlier shell.

## Verification

Minimum checks:

```bash
cd frontend
npm run mobile:typecheck
npm run mobile:test
npm run mobile:lint
```

Android install/run:

```bash
cd frontend
npm run mobile:android
```
