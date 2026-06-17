# API Layer Gap Closure — Design Spec

**Date:** 2026-06-17
**Status:** Approved
**Scope:** Step 2 of IM project migration — close the loop from backend routes → endpoint contracts → API client methods → provider/notifier callable

---

## 1. Objective

Ensure every backend REST endpoint that a normal frontend UI should call has:
1. An endpoint constant in `api_endpoints.dart`
2. A typed API client method in shared_features
3. Unit tests for the client method

**Out of scope:** UI pages, backend logic changes, new backend routes, production config, coverage gates.

---

## 2. Architecture Decisions

### 2.1 All API clients live in `shared_features`

Web app's duplicate `AiApi` and `FileApi` will become re-exports of the shared_features version. The robust JSON normalization (`_extractItems`, `_stringValue`, `_boolValue`) from web's `AiApi` moves into the shared version.

### 2.2 OTK → OPK replacement

Remove legacy `getOtkCount()` and `replenishOtk()` from `E2eeApi`. They call `/api/keys/otk-count` and `/api/keys/otk` which no longer exist on the backend. Replace with `getOpkStatus()`, `refillOpk()`, `deleteExpiredOpk()` which already exist and map to `/api/keys/opk/...`.

### 2.3 PushApi — new file

Create `shared_features/lib/src/push/data/push_api.dart` with 5 methods. `PushPort` (the abstract interface for platform push adapters) remains unchanged; `PushApi` is a separate HTTP client for the `/api/push/...` REST endpoints.

### 2.4 AI Stream — buildStreamUrl only

Add `AiEndpoints.stream(taskId)` constant and `AiApi.buildStreamUrl(taskId)` method. SSE connection logic deferred — `HttpClientPort` does not support streaming. Add `// TODO: SSE adapter` comment.

### 2.5 Internal routes not exposed

| Route | Reason |
|-------|--------|
| `/api/auth/internal/*` (9 routes) | Service-to-service auth |
| `/api/group/internal/memberIds/:group_id` | Service-to-service |
| `/api/ai/internal/reply` | Internal AI pipeline |

These will NOT get endpoint constants or client methods. If a future internal client is needed, it gets its own `InternalAuthEndpoints` / `InternalAiEndpoints` class.

---

## 3. Gap Analysis

### 3.1 Endpoint Constants — Missing from `api_endpoints.dart`

**E2eeEndpoints** (12 missing):
```
salt         → /api/keys/salt
uploadBackup → /api/keys/backup (POST)
getBackup    → /api/keys/backup (GET)
deleteDevice → /api/keys/device/:id (DELETE)
createSession → /api/e2ee/sessions (POST)
conversationSession → /api/e2ee/conversations/:id/session
rotateConversationSession → /api/e2ee/conversations/:id/rotate
enableGroup  → /api/e2ee/groups/:id/enable
disableGroup → /api/e2ee/groups/:id/disable
pushGroupSenderKey → /api/e2ee/groups/:id/sender-key
getGroupSenderKeys → /api/e2ee/groups/:id/sender-keys
removeGroupSenderKey → /api/e2ee/groups/:id/sender-keys/:user_id
getGroupStatus → /api/e2ee/groups/:id/status
groupDevices → /api/e2ee/groups/:id/devices
```

**AiEndpoints** (6 missing):
```
summary      → /api/ai/summary
stream       → /api/ai/stream/:task_id
uploadRagDoc → /api/ai/rag/docs (POST)
listRagDocs  → /api/ai/rag/docs (GET)
deleteRagDoc → /api/ai/rag/docs/:id (DELETE)
queryRag     → /api/ai/rag/query
```

**UserEndpoints** (1 missing):
```
offline      → /api/user/offline
```

### 3.2 API Client Methods — Missing

| Class | Missing Methods |
|-------|----------------|
| `MessageApi` | `recallMessage(messageId)`, `deleteMessage(messageId)` |
| `FileApi` | `uploadAvatar(bytes, fileName)`, `downloadByGet(params)`, `downloadByPost(params)`, `getFileInfo(params)`, `deleteFile(params)` |
| `E2eeApi` | `getSalt()`, `uploadKeyBackup(data)`, `getKeyBackup()`, `deleteDevice(deviceId)`, `getConversationSession(convId)`, `rotateConversationSession(convId, data)`, `enableGroupE2ee(groupId, data)`, `disableGroupE2ee(groupId)`, `pushGroupSenderKey(groupId, data)`, `getGroupSenderKeys(groupId)`, `removeGroupSenderKey(groupId, userId)`, `getGroupE2eeStatus(groupId)`, `getGroupDevices(groupId)` — also remove `getOtkCount()`, `replenishOtk()` |
| `AiApi` | `updateKey(id, data)`, `testKey(id)` (shared version), `createSummary(data)`, `buildStreamUrl(taskId)`, `uploadRagDoc(data)`, `listRagDocs()`, `deleteRagDoc(id)`, `queryRag(data)` |
| `PushApi` (new) | `registerDevice(data)`, `unregisterDevice(data)`, `updateDeviceToken(data)`, `getSettings()`, `updateSettings(data)` |
| `GroupApi` | `addMembers(groupId, memberIds)`, `updateGroup(groupId, data)`, `dismissGroup(groupId)` |

### 3.3 Already Complete (no changes needed)

- `ContactsApi` — all 9 methods present
- `MomentsApi` — all 14 methods present
- `SettingsApi` — all user settings/profile methods present

---

## 4. Implementation Plan by Domain

### Batch 1: Endpoint Contracts

**File:** `flutter/packages/core/lib/src/contracts/api_endpoints.dart`

Add missing constants to `E2eeEndpoints`, `AiEndpoints`, `UserEndpoints`. Remove `otkCount` and `otk` from `E2eeEndpoints`.

**File:** `flutter/packages/core/test/contracts/api_endpoints_test.dart`

Add tests for all new constants. Verify `/api/` prefix contract still holds.

### Batch 2: MessageApi

**File:** `flutter/packages/shared_features/lib/src/chat/data/message_api.dart`

Add:
```dart
Future<Message> recallMessage(String messageId)
Future<Message> deleteMessage(String messageId)
```

Both use POST, return `Message.fromJson`.

### Batch 3: FileApi

**File:** `flutter/packages/shared_features/lib/src/chat/data/file_api.dart`

Add 5 methods using existing upload pattern + `FileEndpoints` constants. Add minimal DTOs: `FileDownloadRequest`, `FileDeleteRequest`, `FileInfoDto`.

### Batch 4: E2eeApi

**File:** `flutter/packages/shared_features/lib/src/e2ee/data/e2ee_api.dart`

- Remove `getOtkCount()` and `replenishOtk()`
- Remove `otkCount` and `otk` endpoint references
- Add 13 new methods

### Batch 5: AiApi

**File:** `flutter/packages/shared_features/lib/src/settings/data/ai_api.dart`

Merge robust normalization from web version. Add 8 missing methods. Add `buildStreamUrl(taskId)`.

**File:** `flutter/apps/web/lib/features/settings/data/ai_api.dart`

Change to re-export from shared_features.

**File:** `flutter/apps/web/lib/features/chat/data/file_api.dart`

Change to re-export from shared_features.

### Batch 6: PushApi (new)

**File:** `flutter/packages/shared_features/lib/src/push/data/push_api.dart`
**File:** `flutter/packages/shared_features/lib/src/push/data/push_api_provider.dart`

Create with 5 methods following existing patterns.

### Batch 7: GroupApi

**File:** `flutter/packages/shared_features/lib/src/group/data/group_api.dart`

Add 3 missing methods.

### Batch 8: Tests

Create test files for each API client in `shared_features/test/`:
- `chat/message_api_test.dart`
- `chat/file_api_test.dart`
- `e2ee/e2ee_api_test.dart`
- `settings/ai_api_test.dart`
- `push/push_api_test.dart`
- `contacts/contacts_api_test.dart`
- `group/group_api_test.dart`
- `moments/moments_api_test.dart`

Test pattern: `FakeHttpClientPort` records `method`, `path`, `body`, `queryParameters`. Each test verifies path, HTTP method, body shape, and `fromJson` mapping.

---

## 5. Naming Conventions

- DTOs: `XxxRequest` / `XxxResponse` / `XxxDto`
- Methods: camelCase, descriptive verb (e.g., `recallMessage`, `uploadKeyBackup`)
- JSON fields: match backend's primary casing (camelCase for Rust axum handlers using `#[serde(rename_all = "camelCase")]`)

---

## 6. Constraints

- No new pages
- No backend logic changes
- No restored legacy paths
- No new third-party dependencies
- No coverage gate
- No database/password/deployment changes
