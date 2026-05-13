# @im/mobile

Android-first Bare React Native client for the IM workspace.

## Scope

- Package: `@im/mobile`
- Path: `frontend/apps/mobile`
- React Native CLI, not Expo Go and not WebView/Capacitor.
- Android is the validation target for this phase. iOS project files are kept structurally compatible but are not a release gate here.
- E2EE is intentionally deferred. Encrypted messages are masked and encrypted-session sending is blocked instead of faking encryption.

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

Copy `apps/mobile/.env.example` for local reference and provide these values through the React Native environment or runtime override:

```bash
API_BASE_URL=http://10.0.2.2:8082/api
WS_BASE_URL=ws://10.0.2.2:8082
FILE_BASE_URL=http://10.0.2.2:8082
```

Use `10.0.2.2` for Android Emulator. Use the development machine LAN IP for a physical Android device.

## Implemented Client Areas

- Auth/session restore with Keychain token storage, cookie mirroring, refresh coordinator, 401 retry, and session generation guard.
- Real HTTP services for auth, user, friends, groups, messages, files, moments, AI settings, and logs.
- Zustand stores for auth, user, chat, sessions, messages, contacts, groups, settings, websocket, moments, notifications, and uploads.
- SQLite-backed message/session/pending/upload repositories with in-memory fallback when native SQLite is unavailable.
- Offline pending-message retry with exponential backoff and upload task state.
- Ticketed WebSocket connection, heartbeat, reconnect, event dispatch, dedupe, foreground/background hooks, and notification triggers.
- Notifee local notification adapter and Firebase Messaging token adapter.
- Android permission module for camera, media, microphone, notifications, and file access.
- Native mobile navigation: auth stack, chat/contact/group stacks, moments stack, profile/settings stack.

## Documents

- `MOBILE_PARITY_MATRIX.md` maps Web features to mobile implementation status.
- `LOCAL_STORAGE_DESIGN.md` describes Keychain, MMKV, SQLite, cache cleanup, logout cleanup, pending queue, and upload queue.
- `PUSH_BACKEND_CONTRACT.md` defines missing server push-device endpoints.
- `ANDROID_RUNBOOK.md` describes Android setup, runtime URLs, permissions, FCM placeholders, and common build issues.

## E2EE Degradation

Mobile does not call Web E2EE code, does not create a fake E2EE manager, does not send `encrypted=true`, and does not call encrypted-send APIs. Received encrypted messages are rendered as unsupported:

> 此端到端加密消息暂不能在移动端查看，请在 Web 端查看。

Encrypted sessions block sending:

> 移动端暂不支持端到端加密会话发送，请切换到 Web 端或关闭加密通道。
