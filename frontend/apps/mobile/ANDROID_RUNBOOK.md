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

## Run Android

In another terminal:

```bash
cd frontend
npm run mobile:android
```

## Android Emulator API URLs

Use the emulator loopback host:

```bash
API_BASE_URL=http://10.0.2.2:8082/api
WS_BASE_URL=ws://10.0.2.2:8082
FILE_BASE_URL=http://10.0.2.2:8082
```

## Physical Device API URLs

Use the LAN IP of the machine running the backend:

```bash
API_BASE_URL=http://192.168.x.x:8082/api
WS_BASE_URL=ws://192.168.x.x:8082
FILE_BASE_URL=http://192.168.x.x:8082
```

The phone and backend machine must be on the same reachable network. Firewalls must allow ports 8082 and the WebSocket endpoint.

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
- legacy external storage permissions with SDK guards
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MICROPHONE`

Runtime permission behavior:

- Camera is requested before photo capture.
- Media/file permissions are requested before selecting or reading local files when Android requires it.
- Microphone is requested before recording voice messages.
- Android 13+ notification permission is requested before system notifications.
- Denied permissions show a user-facing message path and can open system settings through the platform service.

## FCM Placeholder

Firebase Messaging client code is present, but a real app requires Android Firebase configuration:

- Add `google-services.json` under `apps/mobile/android/app/`.
- Configure the Firebase Android app id/package.
- Add backend push device endpoints described in `PUSH_BACKEND_CONTRACT.md`.

Do not commit real Firebase secrets or environment-specific files unless the repository policy explicitly allows them.

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

`Java version mismatch` or Gradle toolchain download hangs:

- Install JDK 17 or make it visible through `org.gradle.java.installations.paths`.
- If `services.gradle.org` redirects to a blocked GitHub release download, keep the committed Gradle wrapper mirror or switch to another reachable Gradle distribution mirror.

`google-services.json missing`:

- FCM is optional for local development until server push is implemented.
- If Gradle plugin configuration is later added, provide a development Firebase config locally.

`10.0.2.2 connection refused`:

- Ensure `api-server-rs` is running on the host and bound to a reachable interface.
- Confirm the URL includes `/api` for HTTP calls.

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
