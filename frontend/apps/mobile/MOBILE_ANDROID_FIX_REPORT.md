# Mobile Android Fix Report

## 1. Current Findings

- Mobile was hand-building private and group session IDs in stores and normalizers, while Web/shared uses `@im/shared-im-core` `buildSessionId`.
- Mobile owned a large copy of core normalizer behavior, which could drift from `@im/shared-normalizers`.
- WebSocket current-session checks used raw `conversationId`, so private messages without that field could notify or split sessions incorrectly.
- Pending retry merged server responses only if the backend echoed identity fields exactly; memory fallback could keep local and server rows separately.
- Firebase Messaging calls could throw when no Firebase Android app is configured.
- Android Manifest used `usesCleartextTraffic` placeholder but Gradle did not define debug/release values.
- Release Gradle config used debug signing as the long-term release path and had fixed version values.
- Root workspace mobile scripts did not forward extra CLI args to the mobile workspace, so commands like `npm run mobile:start -- --reset-cache` were swallowed by npm.
- A debug install could still open the old React Native red screen when Metro was not running or `adb reverse tcp:8081 tcp:8081` had not been restored after emulator reconnect.
- `/message/read/:conversationId` in shared routes still uses the legacy `conversationId` placeholder name, but the backend actually parses a mixed read target: private chats accept `peerId`, group chats accept `group_{id}`.

## 2. Fix Scope

- Added mobile adapters for session, message, and model conversion.
- Unified private/group session IDs through `@im/shared-im-core`.
- Reused shared message identity and merge helpers for Zustand and SQLite memory fallback.
- Extended shared normalizers for snake_case conversation, group, and friendship fields needed by mobile.
- Made Firebase Messaging optional at runtime; Notifee local notifications remain active.
- Added Android debug/release cleartext placeholders, release signing environment placeholders, version properties, and missing permissions.
- Added mobile unit coverage for session IDs, normalizers, pending merge/retry, WebSocket notification routing, FCM degradation, and E2EE blocking.
- Clarified mobile `markRead` semantics with an explicit read-target helper so private chats send `peerId` and group chats send `group_{id}`.
- Made mobile `markRead` failure non-blocking while recording a warning for diagnosis.
- Updated the root mobile script wrappers to forward CLI args to `@im/mobile`.
- Updated `mobile:android` to check Metro status and attempt `adb reverse` before and after launch.

## 3. Out of Scope

- E2EE implementation and Web E2EE migration.
- Backend push-device APIs and server-side offline push.
- New product features, page rewrites, or Web behavior changes.
- Android release keystore creation and Play Store hardening.

## 3.1 Message Read Contract

- Endpoint path remains `/message/read/:conversationId`, but mobile now treats the path segment as a read target instead of a literal conversation ID.
- Private chat read target: send the peer user id directly, for example `2`.
- Group chat read target: send the frontend group session id, for example `group_9`.
- This matches the backend `mark_read` parser behavior: it resolves private targets from `peer_id` and group targets from `group_id`, then writes read receipts using the frontend-facing IDs.
- On success, mobile clears the local session unread count.
- On failure, mobile only records a `logger.warn` entry and keeps the page flow intact; unread count is left unchanged until a later success or session refresh.

## 4. Verification Results

- `npm run mobile:typecheck`: PASS.
- `npm install`: PASS, no dependency changes needed.
- `npm run mobile:test`: PASS, 2 suites / 32 tests.
- `npm run mobile:lint`: PASS.
- `npm run mobile:clean`: PASS.
- `npm run mobile:android`: PASS. Gradle installed and launched `app-debug.apk` on `emulator-5554`.
- Runtime screenshot check: PASS. The app reached the login screen instead of the `Unable to load script` red screen after Metro finished bundling.
- Recent logcat check found no `FATAL EXCEPTION`, `Unable to load script`, `No Firebase App`, or Firebase startup crash.

## 5. Android Device Checklist

- Keep Metro running with `npm run mobile:start`.
- `npm run mobile:android` now attempts `adb reverse` automatically; run `npm run mobile:reverse` manually if the app was already open on a red error screen.
- Verify login, session list, private chat, group chat, retry after network loss, and notification click routing.
- For local FCM testing, add a non-production `google-services.json` locally and do not commit it.
- Configure `API_BASE_URL`, `WS_BASE_URL`, and `FILE_BASE_URL` for emulator `10.0.2.2` or a physical device LAN IP.
- For release builds, provide `IM_MOBILE_RELEASE_*` signing variables and keep release cleartext disabled.
- Manual follow-up: verify a real private chat and group chat on device both clear unread state and emit the expected backend read receipt.
