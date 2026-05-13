# Local Storage Design

## Layers

The mobile app uses three storage layers and does not put all data into AsyncStorage.

| Layer | Library | Purpose |
|---|---|---|
| SecureStorage | `react-native-keychain` | Access token, cookie mirror, sensitive session metadata |
| KVStorage | `react-native-mmkv` | Lightweight settings and flags |
| MessageDatabase | `react-native-quick-sqlite` | Sessions, messages, pending sends, upload tasks, media cache, notification log |

## Keychain

Stored keys:

- `im.mobile.access-token`
- `im.mobile.session-meta`
- `im.mobile.cookie-mirror`

Rules:

- Never log token, cookie, password, API key, or raw session secret.
- Clear Keychain only on logout or explicit session invalidation.
- Cache cleanup must not delete Keychain session entries.

## MMKV

Stored values:

- Theme and locale.
- Notification, sound, and read-receipt settings.
- Current session id.
- Draft map.
- App feature flags.
- FCM token cache.
- Last sync timestamp.
- User snapshot for fast startup shell only.

## SQLite

Schema version is stored in `mobile_meta` with key `schema_version`. Current version: `1`.

Tables:

- `mobile_sessions`
- `mobile_messages`
- `mobile_pending_messages`
- `mobile_upload_tasks`
- `mobile_media_cache`
- `mobile_notification_events`

### `mobile_messages`

Columns:

- `id`
- `serverId`
- `clientMessageId`
- `conversationId`
- `senderId`
- `receiverId`
- `groupId`
- `messageType`
- `content`
- `mediaUrl`
- `thumbnailUrl`
- `mediaName`
- `mediaSize`
- `duration`
- `status`
- `readStatus`
- `readByCount`
- `sendTime`
- `createdAt`
- `updatedAt`
- `rawJson`

Indexes:

- Unique `(conversationId, serverId)` when `serverId` exists.
- Unique `(conversationId, clientMessageId)` when `clientMessageId` exists.
- `(conversationId, sendTime)` for history paging.

### `mobile_pending_messages`

Columns:

- `localId`
- `conversationId`
- `sendType`
- `payloadJson`
- `status`
- `retryCount`
- `lastError`
- `createdAt`
- `updatedAt`
- `nextRetryAt`

### `mobile_upload_tasks`

Columns:

- `taskId`
- `conversationId`
- `localMessageId`
- `fileUri`
- `fileName`
- `mimeType`
- `fileSize`
- `uploadType`
- `status`
- `progress`
- `retryCount`
- `remoteUrl`
- `lastError`
- `createdAt`
- `updatedAt`

## Migration Strategy

`storageMigrations.ts` owns schema SQL and `DB_VERSION`. `initializeStorage()` opens SQLite, runs schema creation idempotently, then writes the schema version. Future versions must add forward-only migrations and keep old data readable.

If SQLite open or query fails, repositories degrade to memory maps and log a sanitized storage error. The app should remain usable, but persistence is reduced until SQLite is available again.

## Cache Cleanup

The clear-cache action may remove:

- Message cache rows.
- Upload temp tasks and failed task rows.
- Media cache index.
- Notification event log.

It must not remove:

- Access token.
- Cookie mirror.
- Sensitive session metadata.

## Logout Strategy

Logout must:

- Call the real logout endpoint.
- Disconnect WebSocket and stop reconnect timers.
- Clear Keychain session values and cookies.
- Clear auth store and notification binding state.
- Keep or remove message cache according to user setting; default implementation keeps durable non-sensitive message cache unless cache cleanup is chosen.

## Offline Queue

Send flow:

1. Generate `clientMessageId` and local id.
2. Insert into `mobile_pending_messages`.
3. Insert optimistic local message with `SENDING`.
4. For media messages, create or reuse a stable `mobile_upload_tasks` row and store its `uploadTaskId` in `payloadJson`.
5. Upload media first when needed, then replace the pending payload media URL with the remote URL.
6. Send real message API request only after upload succeeds.
7. On success, upsert server message and delete pending row.
8. On failure, mark local message `FAILED`, increment retry count, and set `nextRetryAt` using exponential backoff.

Media retry never sends a local `file://` URI to the message API. It reuses the same upload task for the same local message and keeps retry state in SQLite across restarts.

Encrypted pending payloads are blocked. Mobile never retries or sends `encrypted=true` payloads in this phase.

## Upload Queue

Upload tasks persist file URI, metadata, progress, retry count, and remote URL. Failed uploads can be retried without creating duplicate local messages or duplicate upload tasks. Message pending payloads reference upload tasks by `uploadTaskId`; retry first completes or reuses the uploaded remote URL, then sends the message payload.
