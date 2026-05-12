# Frontend Monorepo Split Design

**Date**: 2026-05-11
**Status**: Approved
**Scope**: Split `frontend/` from a single Vue 3 app into a monorepo with `apps/web` + 8 shared packages.

## Goal

Transform `frontend/` into an npm workspaces monorepo:

```text
frontend/
├── package.json              # workspace root (@im/frontend-workspace)
├── tsconfig.base.json
├── README.md
├── apps/
│   └── web/                  # Vue 3 + Vite + Pinia + Element Plus (current app)
└── packages/
    ├── shared-types/         # Framework-agnostic types + runtime guards
    ├── shared-api-contract/  # API endpoints, WS message types, business codes
    ├── shared-normalizers/   # Data normalization functions
    ├── shared-utils/         # Pure utility functions
    ├── shared-im-core/       # IM business logic (session, message, sort, dedup)
    ├── shared-auth-core/     # Auth algorithms (token decode, refresh coordination)
    ├── shared-ws-core/       # WS protocol, heartbeat, reconnect strategy
    └── shared-platform-ports/# Interface definitions (Storage, HTTP, Logger, etc.)
```

## Constraints

1. **No mobile code** - No React Native, Expo, or `apps/mobile`
2. **No Vue in packages** - `packages/*` must not depend on vue, pinia, vue-router, element-plus, @capacitor/*, or browser APIs
3. **Dependency direction** - `apps/web → packages/*`, `packages/* → packages/*`. Never `packages/* → apps/web`
4. **@ alias unchanged** - `@` in `apps/web` continues to point to `apps/web/src`
5. **No behavior changes** - Login, register, routing, chat, WS, E2EE, AI, moments must all work identically
6. **Phased execution** - Each phase verified before proceeding

## Design Decisions

### types/utils.ts → shared-types

Runtime guard functions (`isRecord`, `asString`, `asNumber`, `asBoolean`, `isRawMessage`, `isRawUser`, etc.) stay in `shared-types` because they are tightly coupled with the type definitions and used extensively by normalizers.

### E2EE → stays in apps/web

The `features/e2ee/` subsystem uses Web Crypto API extensively (`crypto-primitives.ts`, `double-ratchet.ts`, `x3dh.ts`, `sender-key.ts`). All E2EE code remains in `apps/web/src/features/e2ee/`.

### Moments → types only

`features/moments/` Vue components and composables stay in `apps/web`. Moment-related types (`MomentsPost`, etc.) are extracted to `shared-types`.

### Package manager: npm workspaces

Current project uses npm (`package-lock.json` exists). Monorepo uses npm workspaces.

## Phase Plan

### Phase 00: Analysis (no code changes)

Read and classify all source files. Output `FRONTEND_SPLIT_ANALYSIS.md`.

### Phase 01: Path reference scan (no code changes)

Scan all references to `frontend/` paths across the repo. Output `FRONTEND_PATH_REFERENCE_REPORT.md`.

### Phase 02: Migrate Vue Web to apps/web

- Create `frontend/apps/web/`
- Move all current frontend files into `apps/web/`
- `apps/web/package.json` name → `@im/web`
- Root `package.json` → workspace root, name `@im/frontend-workspace`
- Root scripts: `web:dev`, `web:build`, `web:typecheck`, `web:test`, `typecheck`
- `apps/web/vite.config.ts` @ alias → `apps/web/src`

Files to move:
- `src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- `Dockerfile`, `nginx.conf`, `nginx-main.conf`
- `.env*`, `.gitignore`, `.dockerignore`
- `capacitor.config.ts`, `android/`, `ios/`
- `eslint.config.mjs`, `auto-imports.d.ts`, `components.d.ts`
- `package.json`, `package-lock.json`, `node_modules/`

### Phase 03: Fix path references

- `deploy/sit/docker-compose.yml`: context `../../frontend` → `../../frontend/apps/web`
- `scripts/deploy_utils.py`: `frontend_root` → `root / "frontend" / "apps" / "web"`
- `scripts/deploy_services.py`: update frontend service paths
- Root `package.json` scripts delegate to `apps/web`

### Phase 04: Create packages skeleton

Create 8 packages, each with `package.json`, `tsconfig.json`, `src/index.ts`, `README.md`.

Package names:
- `@im/shared-types`
- `@im/shared-api-contract`
- `@im/shared-normalizers`
- `@im/shared-utils`
- `@im/shared-im-core`
- `@im/shared-auth-core`
- `@im/shared-ws-core`
- `@im/shared-platform-ports`

### Phase 05: Configure workspace + tsconfig

- Root `package.json` workspaces: `["apps/*", "packages/*"]`
- `tsconfig.base.json` with shared compiler options
- Each package `tsconfig.json` extends base
- `apps/web/tsconfig.json` extends base, adds paths for `@im/*`
- `apps/web/vite.config.ts` can resolve workspace packages

### Phase 06: Extract shared-types

Source: `apps/web/src/types/*.ts` (except `vue-virtual-scroller.d.ts`)

Files to create in `packages/shared-types/src/`:
- `api.ts` — ApiResponse, PageRequest, PageResponse, FileUploadResponse
- `auth.ts` — TokenParseResultDTO, TokenPairDTO, WsTicketDTO
- `user.ts` — User, LoginRequest, RegisterRequest, Friendship, FriendRequest, UserSettings, etc.
- `message.ts` — Message, MessageType, MessageStatus, RawMessageDTO, SendPrivateMessageRequest, etc.
- `session.ts` — ChatSession, ChatSessionType, RawConversationDTO, OnlineStatus, WebSocketMessage, ReadReceipt, GroupReadUser
- `friend.ts` — (re-exports from user.ts or separate)
- `group.ts` — Group, RawGroupDTO, GroupMember, RawGroupMemberDTO, CreateGroupRequest
- `websocket.ts` — WebSocketMessage type (already in session.ts, may re-export)
- `moments.ts` — MomentsPost and related types (from `types/moments.ts`)
- `utils.ts` — isRecord, asString, asNumber, asBoolean, isRawMessage, isRawUser, isApiResponse, etc.
- `index.ts` — re-export all

### Phase 07: Let apps/web use shared-types

Replace imports in `apps/web/src/types/`, services, stores, normalizers with `@im/shared-types`.
Keep `apps/web/src/types/index.ts` as a re-export layer for backward compatibility.

### Phase 08: Extract shared-api-contract

Source: `apps/web/src/services/*.ts` endpoint paths, `stores/websocket.ts` WS types

Files to create:
- `auth.endpoints.ts` — `/auth/parse`, `/auth/refresh`, `/auth/ws-ticket`
- `user.endpoints.ts` — `/user/login`, `/user/register`, `/user/profile`, etc.
- `message.endpoints.ts` — `/message/send/private`, `/message/send/group`, etc.
- `friend.endpoints.ts` — `/friend/list`, `/friend/request`, etc.
- `group.endpoints.ts` — `/group/create`, `/group/list`, etc.
- `websocket.endpoints.ts` — WS path, ticket param
- `codes.ts` — business codes, WS message types (MESSAGE, ONLINE_STATUS, etc.)
- `index.ts`

### Phase 09: Let apps/web use shared-api-contract

Replace hardcoded paths and message type constants in services and websocket store.

### Phase 10: Extract shared-normalizers

Source: `apps/web/src/normalizers/*.ts`

Files to create:
- `message.ts` — normalizeMessage, normalizeMessageConfig, normalizeReadReceipt, normalizeMessageType, normalizeMessageStatus, splitTextByCodePoints
- `user.ts` — normalizeUser, normalizeFriendship, normalizeFriendRequest, normalizeUserAuthResponse, normalizeUserSettings, defaultUserSettings
- `chat.ts` — normalizeConversation (depends on buildSessionId from shared-im-core)
- `group.ts` — normalizeGroup, normalizeGroupMember
- `moments.ts` — (if any normalizers exist)
- `friendRequest.ts` — extractFriendRequestList
- `index.ts`

Dependencies: `@im/shared-types`

Note on toBigIntId/compareIds/buildSessionId/safePreferExistingId: These functions live in `normalizers/chat.ts` but logically belong in shared-im-core. Phase 10 places them in shared-normalizers initially. Phase 13 moves them to shared-im-core and updates shared-normalizers to import from `@im/shared-im-core`. This avoids requiring Phase 13 to run before Phase 10.

### Phase 11: Let apps/web use shared-normalizers

Replace normalizer imports in services and stores.

### Phase 12: Extract shared-utils

Source: `apps/web/src/utils/auth.ts` pure validation functions

Files to create:
- `validation.ts` — validateEmail, validatePhone, validateUsername, validatePasswordStrength
- `mask.ts` — maskSensitiveInfo (email, phone, idCard)
- `trace.ts` — createTraceId
- `index.ts`

NOT included (platform-dependent):
- getToken/setToken/removeToken (localStorage)
- isLoggedIn (localStorage)
- formatTokenForHeader (platform-specific)

### Phase 13-16: Extract shared-im-core

**Batch 1** (Phase 13): Session/message identity
- `session-id.ts` — buildSessionId, toBigIntId, compareIds (moved from shared-normalizers)
- `message-identity.ts` — hasSameMessageIdentity, messageIdentityValues, safePreferExistingId (moved from shared-normalizers)
- `message-sort.ts` — sortMessagesAscending, messageTimeValue
- `message-window.ts` — limitMessageWindow, MESSAGE_WINDOW_SIZE
- `message-dedup.ts` — dedupeMessages, mergeMessagesChronologically

After Phase 13, shared-normalizers is updated to depend on shared-im-core for these functions.

**Batch 2** (Phase 15): Pending/message lifecycle
- `message-create.ts` — createLocalTextMessage, createClientMessageId
- `message-merge.ts` — mergeServerMessageWithPending, applyMessageToMessageList
- `message-status.ts` — markMessageFailed, markMessagePending, markMessageSent
- `session-update.ts` — resolveMessageSessionId, shouldIncrementUnread, applyIncomingMessageToSession
- `read-receipt.ts` — applyReadReceiptToMessages

Source: `stores/modules/message-helpers.ts`, `stores/message.ts`, `stores/session.ts`, `stores/websocket.ts`

### Phase 17-18: Extract shared-auth-core

Source: `services/auth-refresh.ts`, `utils/auth.ts`

Files to create:
- `token.ts` — decodeAccessTokenClaims, isAccessTokenExpiringSoon, getUserIdFromToken
- `refresh-coordinator.ts` — createRefreshCoordinator (concurrent refresh merging)
- `classify.ts` — classifyRefreshFailureStatus, shouldSkipRefreshEndpoint
- `ports.ts` — AuthApiPort, TokenStoragePort, AuthSessionPort interfaces
- `types.ts` — RefreshAccessTokenResult, RefreshAccessTokenStatus
- `index.ts`

### Phase 19-20: Extract shared-ws-core

Source: `stores/websocket.ts`

Files to create:
- `path.ts` — createTicketedWebSocketPath
- `heartbeat.ts` — createHeartbeatPayload
- `payload.ts` — parseWebSocketPayload, isMessagePayload, isOnlineStatusPayload, isReadReceiptPayload, isSystemPayload
- `strategy.ts` — shouldProcessSequentially, createReconnectDelay
- `constants.ts` — DUPLICATE_CONNECTION_REASON
- `index.ts`

### Phase 21: Extract shared-platform-ports

Interface definitions only:
- `StoragePort` — getItem, setItem, removeItem
- `SecureStoragePort` — encrypted storage
- `HttpClientPort` — get, post, put, delete
- `LoggerPort` — info, warn, error, debug
- `NotifierPort` — notify
- `NavigatorPort` — openUrl, canGoBack
- `LifecyclePort` — onForeground, onBackground
- `NetworkStatusPort` — onOnline, onOffline, isConnected
- `ClockPort` — now, nowMs
- `UuidPort` — uuid

### Phase 22-24: Tests

Add vitest tests for shared-normalizers, shared-im-core, shared-auth-core, shared-ws-core.

### Phase 25: Clean up

Remove duplicated pure functions from apps/web that are now in packages. Keep re-export layers.

### Phase 26: Documentation

Update READMEs for root, apps/web, and each package.

### Phase 27: Final verification

Run all checks, output `FRONTEND_SPLIT_REPORT.md`.

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| SCSS `@` alias breaks | Verify `additionalData` in vite.config.ts still resolves |
| Docker context path | Update docker-compose.yml context to `../../frontend/apps/web` |
| Capacitor paths | Verify capacitor.config.ts after migration |
| auto-imports.d.ts | Regenerate after migration |
| Test setup | Verify `src/test/setup.ts` path after migration |

## Verification Commands

After each phase:
```bash
cd frontend
npm install
npm run typecheck
npm run web:typecheck
npm run web:build
```
