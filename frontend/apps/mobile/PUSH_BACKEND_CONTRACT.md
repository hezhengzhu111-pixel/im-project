# Push Backend Contract

## Current Mobile Client

Implemented on the client:

- Notifee Android notification channel.
- Local notifications for chat messages, friend events, and system events.
- Notification click routing to chat and friend-request flows.
- Notification and sound switches through MMKV-backed settings.
- SQLite notification event log for displayed, suppressed, opened, foreground, background, and initial-notification events.
- Firebase Messaging registration, token fetch, token refresh listener, foreground/background message handlers, notification-opened handler, initial-notification handling, and local token cache.
- Shared API contract endpoints for push-device registration, token rotation, and push settings.
- Android mobile client `pushDeviceService` for register, unregister, token update, and push settings read/write.
- Login flow attempts `getFcmToken()` then calls device register when token is available.
- Logout flow attempts device unregister but never blocks local session cleanup.
- Token refresh updates the local token and attempts backend token rotation.
- Push backend missing, `404`, or unimplemented responses degrade to warning logs and do not block app startup, login, logout, or normal chat flows.

Client delivery status: `CLIENT_DONE`.

Backend delivery status: `BACKEND_REQUIRED`.

Current backend status:

- `shared-api-contract` now exposes the required push endpoints.
- No user-facing `/api/push/devices/*` or `/api/push/settings` endpoints were found in current Rust/Java services.
- Existing backend push code is limited to internal dispatcher flow such as `api-server-rs/src/push_dispatcher.rs`; it does not satisfy the mobile client contract below.
- Offline FCM delivery remains blocked until backend endpoints are implemented.

## Required Endpoints

Note: mobile `APP_CONFIG.API_BASE_URL` already ends with `/api`, so shared contract constants use `/push/...` while the full HTTP routes below remain `/api/push/...`.

### `POST /api/push/devices/register`

Status:

- Client: `DONE`
- Backend: `TODO`

Registers or reactivates a device for the authenticated user.

Request:

```json
{
  "deviceId": "android-unique-device-id",
  "platform": "ANDROID",
  "fcmToken": "firebase-token",
  "appVersion": "0.0.1",
  "deviceModel": "Pixel 8",
  "osVersion": "Android 14",
  "locale": "zh-CN",
  "timezone": "Asia/Shanghai"
}
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "deviceId": "android-unique-device-id",
    "registered": true,
    "tokenVersion": 1
  }
}
```

Auth: user access token and refresh-cookie-compatible session.

Idempotency: same `(userId, deviceId)` updates token and metadata.

Multi-device: one user may have multiple active devices; tokens are unique per device.

### `POST /api/push/devices/unregister`

Status:

- Client: `DONE`
- Backend: `TODO`

Disables push for a device, usually during logout.

Request:

```json
{
  "deviceId": "android-unique-device-id",
  "fcmToken": "firebase-token",
  "reason": "LOGOUT"
}
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": true
}
```

Idempotency: unregistering an already inactive device returns success.

Logout behavior: unregister before local session cleanup when possible; failure must not block logout.

### `PUT /api/push/devices/token`

Status:

- Client: `DONE`
- Backend: `TODO`

Rotates the FCM token after Firebase token refresh.

Request:

```json
{
  "deviceId": "android-unique-device-id",
  "oldToken": "previous-token",
  "newToken": "new-token"
}
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "updated": true,
    "tokenVersion": 2
  }
}
```

Token refresh behavior: update must be accepted even if `oldToken` is missing or already expired, as long as the user owns `deviceId`.

### `GET /api/push/settings`

Status:

- Client: `DONE`
- Backend: `TODO`

Returns user-level and session-level notification settings.

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "enabled": true,
    "soundEnabled": true,
    "showPreview": true,
    "mutedConversationIds": ["private_1_2"],
    "androidChannelPolicy": {
      "messages": "im-messages",
      "friendEvents": "im-social",
      "system": "im-system"
    }
  }
}
```

Auth: user access token.

### `PUT /api/push/settings`

Status:

- Client: `DONE`
- Backend: `TODO`

Updates notification settings.

Request:

```json
{
  "enabled": true,
  "soundEnabled": false,
  "showPreview": true,
  "mutedConversationIds": ["private_1_2"]
}
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": true
}
```

Idempotency: repeated writes with the same payload return success.

### `POST /api/push/internal/send`

Status:

- Client: `N/A`
- Backend: `TODO`

Internal service endpoint used by message fanout or offline dispatcher to send FCM notifications.

Request:

```json
{
  "eventId": "message-server-id",
  "kind": "PRIVATE_MESSAGE",
  "userIds": ["2"],
  "conversationId": "private_1_2",
  "title": "Alice",
  "body": "hello",
  "data": {
    "route": "Chat",
    "conversationId": "private_1_2",
    "messageId": "123"
  }
}
```

Response:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "sent": 1,
    "skipped": 0,
    "invalidTokens": []
  }
}
```

Auth: internal HMAC or service token, not end-user token.

Idempotency: same `eventId` must not send duplicate notifications.

## Policy Requirements

Multi-device:

- Send to every active device for the target user.
- Do not send to the sender device for self-authored messages.
- Remove invalid FCM tokens after Firebase permanent failures.

Token lifecycle:

- Register on login after FCM token fetch.
- Update on Firebase token refresh.
- Unregister on logout.
- Keep a server `lastSeenAt`, `lastTokenRefreshAt`, and `disabledAt`.

Offline decision:

- Prefer existing route registry / presence data.
- If user has an active WebSocket route, do not send offline FCM unless user settings request duplicate push.
- If no route exists or route is stale, send FCM.

Mute and preview policy:

- Respect global notification enabled.
- Respect conversation mute.
- Respect per-channel Android policy.
- If preview is disabled or message is encrypted, send generic body only.

Android channel policy:

- `im-messages`: private and group chat messages.
- `im-social`: friend request and friend accepted events.
- `im-system`: system notices.
- Channel ids should be stable; do not create per-conversation channels unless explicitly configured.
