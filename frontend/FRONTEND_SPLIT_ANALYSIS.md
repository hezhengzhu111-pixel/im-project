# Frontend Monorepo Split Analysis

**Date:** 2026-05-11
**Scope:** `frontend/src/` -- Vue 3 + Vite + Pinia + Element Plus IM application
**Goal:** Extract framework-agnostic code into 8 shared packages under `frontend/packages/`

---

## 1. Current Frontend Structure Overview

```
frontend/src/
  types/            9 files,  ~910 lines   -- TypeScript interfaces & runtime guards
  normalizers/      6 files,  ~850 lines   -- DTO -> domain object normalization
  services/        22 files, ~1,800 lines  -- API service layer (HTTP calls + normalization)
  stores/           8 files, ~3,100 lines  -- Pinia state management
  stores/modules/   6 files, ~1,400 lines  -- Message store sub-modules
  utils/           10 files, ~1,800 lines  -- HTTP client, message repo, auth utils, logger
  config/           2 files,  ~216 lines   -- Global constants
  constants/        1 file,   ~107 lines   -- Business constants
  features/e2ee/   24 files, ~3,870 lines  -- End-to-end encryption (Web Crypto API)
  features/moments/ 12 files, ~600 lines   -- Moments/Feed feature (Vue components)
  features/chat/   many files              -- Chat UI components & composables
  pages/           many files              -- Route-level Vue components
  hooks/            1 file,    ~40 lines   -- Error handler hook
  styles/          SCSS files              -- Global styles, variables, themes
  router/          Vue Router config
  test/            Vitest test files
```

**Total analyzed TypeScript:** ~11,338 lines (types + normalizers + services + stores + utils + config)

**Key dependency chains:**
```
types/          --> (none, pure types)
normalizers/    --> types/ (imports interfaces + utils)
constants/      --> (none, pure constants)
config/         --> import.meta.env (Vite-specific, but values are pure data)
utils/logger    --> import.meta.env (Vite-specific)
services/*      --> utils/httpClient, normalizers/*, types/*, stores/*
stores/*        --> Vue (ref/computed/defineStore), services/*, normalizers/*, types/*
utils/httpClient--> axios, qs, logger
utils/messageRepo--> IndexedDB (browser API)
utils/auth      --> localStorage (browser API)
features/e2ee/* --> Web Crypto API, Vue composables
```

---

## 2. Vue-Bound Code (stays in apps/web)

Every file below depends on Vue reactivity (ref, computed, watch, defineStore), Pinia, Vue Router, Element Plus, or browser-only APIs (IndexedDB, localStorage, document, window, Capacitor). These CANNOT be extracted to shared packages.

### Stores (all Pinia defineStore)
| File | Lines | Key Dependencies |
|------|-------|------------------|
| `stores/chat.ts` | 597 | Vue, Pinia, all inner stores, logger |
| `stores/message.ts` | 594 | Vue, Pinia, ElMessage, messageService, messageRepo, appLifecycleService |
| `stores/session.ts` | 465 | Vue, Pinia, messageService, localStorage |
| `stores/user.ts` | 480 | Vue, Pinia, ElMessage, router, authService, userService, localStorage |
| `stores/websocket.ts` | 832 | Vue, Pinia, ElMessage, ElNotification, WebSocket, localStorage, e2ee |
| `stores/contact.ts` | 106 | Vue, Pinia, friendService, userService |
| `stores/group.ts` | 76 | Vue, Pinia, groupService |
| `stores/user-settings.ts` | 189 | Vue, Pinia, localStorage |
| `stores/i18n.ts` | 632 | Vue, Pinia |
| `stores/moments.ts` | 114 | Vue, Pinia, momentsService |

### Store Modules (use Vue Ref types)
| File | Lines | Key Dependencies |
|------|-------|------------------|
| `stores/modules/message-helpers.ts` | 113 | normalizers/chat (framework-agnostic logic, but typed for Vue Ref context) |
| `stores/modules/message-loading.ts` | 404 | Vue Ref, messageService, messageRepo, e2ee decrypt |
| `stores/modules/message-send-queue.ts` | 502 | Vue Ref, messageService, messageRepo, e2ee encrypt, crypto.randomUUID |
| `stores/modules/message-read.ts` | 241 | Vue Ref, messageService, normalizers |
| `stores/modules/message-search.ts` | 87 | Vue Ref, WeakMap cache |
| `stores/modules/message-retry.ts` | 47 | messageService, messageRepo |

### Services (use http client which uses Axios + interceptors + stores)
| File | Lines | Key Dependencies |
|------|-------|------------------|
| `services/auth.ts` | 80 | axios (direct), httpClient, auth-refresh |
| `services/auth-refresh.ts` | 116 | axios (direct), crypto.randomUUID |
| `services/auth-session-adapter.ts` | 286 | useUserStore, httpClient, router, http-error-notifier |
| `services/message.ts` | 153 | httpClient, normalizers |
| `services/user.ts` | 74 | httpClient, normalizers |
| `services/friend.ts` | 48 | httpClient, normalizers |
| `services/group.ts` | 76 | httpClient, normalizers |
| `services/ai.ts` | 65 | httpClient |
| `services/file.ts` | 133 | httpClient, types/utils, window.location |
| `services/heartbeat.ts` | 197 | Vue ref/computed, ElMessage, friendService, userService, useUserStore, appLifecycleService |
| `services/moments.ts` | 93 | httpClient, normalizers/moments |
| `services/http-error-notifier.ts` | 122 | ElMessage, useI18nStore, httpClient |
| `services/index.ts` | 8 | barrel re-export |
| `services/im.ts` | 4 | placeholder |
| `services/camera.service.ts` | 53 | Capacitor Camera |
| `services/download.service.ts` | 54 | Capacitor Filesystem |
| `services/platform/app-lifecycle.service.ts` | 83 | Capacitor App, document |
| `services/platform/network-status.service.ts` | 93 | Capacitor Network, window |
| `services/platform/capacitor-init.ts` | 53 | Capacitor |
| `services/platform/native-runtime.ts` | 9 | Capacitor |
| `services/storage/storage.service.ts` | 37 | Capacitor, localStorage |
| `services/storage/native-storage.service.ts` | 21 | Capacitor Preferences |

### Utils (browser-dependent)
| File | Lines | Key Dependencies |
|------|-------|------------------|
| `utils/httpClient.ts` | 370 | axios, qs, logger, crypto.randomUUID |
| `utils/request.ts` | 9 | httpClient, auth-session-adapter, http-error-notifier |
| `utils/messageRepo.ts` | 367 | IndexedDB (browser API), Message type |
| `utils/auth.ts` | 321 | localStorage, atob (browser API) |
| `utils/common.ts` | 223 | dayjs, constants, logger, navigator.clipboard, document |
| `utils/performance.ts` | 347 | logger |
| `utils/upload.ts` | 168 | File API |
| `utils/image-compression.ts` | 87 | Canvas API |
| `utils/logger.ts` | 37 | import.meta.env.DEV (Vite) |

### Features
| Directory | Lines | Key Dependencies |
|-----------|-------|------------------|
| `features/e2ee/` | 3,870 | Web Crypto API, IndexedDB, Vue composables, Capacitor |
| `features/moments/` | ~600 | Vue components, Element Plus |
| `features/chat/` | many | Vue components, Element Plus, stores |

### Other Vue-bound
| Directory | Key Dependencies |
|-----------|------------------|
| `pages/*.vue` | Vue Router, Element Plus, stores |
| `router/` | Vue Router |
| `hooks/useErrorHandler.ts` | ElMessage |
| `styles/` | SCSS, Element Plus |
| `App.vue` | Vue, stores, router |

---

## 3. Directly Extractable Code (goes to packages)

These files have ZERO Vue/Pinia/Element Plus/browser-API dependencies. They import only from each other and from npm packages with no framework coupling.

### Package: `shared-types`
| File | Lines | Exports |
|------|-------|---------|
| `types/api.ts` | 46 | ApiResponse, PageRequest, PageResponse, FileUploadResponse |
| `types/user.ts` | 220 | User, AuthSession, LoginRequest, Friendship, FriendRequest, UserSettings, etc. |
| `types/message.ts` | 185 | Message, RawMessageDTO, MessageType, MessageStatus, ReadReceipt, etc. |
| `types/chat.ts` | 80 | ChatSession, RawConversationDTO, WebSocketMessage, OnlineStatus, GroupReadUser |
| `types/group.ts` | 86 | Group, RawGroupDTO, GroupMember, RawGroupMemberDTO |
| `types/common.ts` | 77 | FileInfo, SearchResult, MenuItem, FormRule, EventData |
| `types/moments.ts` | 88 | MomentPost, MomentMedia, MomentLike, MomentComment, PostWithDetails |
| `types/utils.ts` | 190 | 18 runtime guards (isRecord, asString, asNumber, isMessage, etc.) + type utilities |
| `types/index.ts` | 18 | barrel re-export |
| `types/vue-virtual-scroller.d.ts` | 7 | Vue ambient module declaration -- excluded (Vue-specific) |
| **Total** | **990** | |

### Package: `shared-normalizers`
| File | Lines | Exports | Dependencies |
|------|-------|---------|--------------|
| `normalizers/message.ts` | 269 | normalizeMessage, normalizeMessageType, normalizeMessageStatus, normalizeReadReceipt, splitTextByCodePoints | types/*, types/utils |
| `normalizers/chat.ts` | 151 | normalizeConversation, buildSessionId, toBigIntId, compareIds, safePreferExistingId | types/*, types/utils |
| `normalizers/user.ts` | 247 | normalizeUser, normalizeFriendship, normalizeFriendRequest, normalizeUserAuthResponse, normalizeUserSettings, defaultUserSettings | types/*, types/utils |
| `normalizers/group.ts` | 61 | normalizeGroup, normalizeGroupMember | types/group, types/utils |
| `normalizers/friendRequest.ts` | 44 | extractFriendRequestList | types/utils |
| `normalizers/moments.ts` | 79 | normalizePostWithDetails, normalizePostWithDetailsList | types/moments, types/utils |
| **Total** | **851** | | Depends on `shared-types` |

### Package: `shared-api-contract`
| File | Lines | Exports | Dependencies |
|------|-------|---------|--------------|
| `config/index.ts` | 142 | API_CONFIG, WS_CONFIG, APP_CONFIG, STORAGE_CONFIG, MESSAGE_CONFIG, UI_CONFIG | import.meta.env (needs shim) |
| `constants/index.ts` | 107 | MESSAGE_TYPES, MESSAGE_STATUS, FILE_TYPES, FILE_SIZE_LIMITS, API_CODES, WS_EVENTS, etc. | (none) |
| **Total** | **249** | | config needs `import.meta.env` shim |

---

## 4. Code Needing Modification Before Extraction

### 4.1 `config/index.ts` -- import.meta.env shim

**Current:** Uses `import.meta.env.VITE_API_BASE_URL` and `import.meta.env.VITE_WS_BASE_URL` directly.
**Fix:** Accept config values via function parameter or inject at initialization time. Provide a `createConfig(env)` factory. The constants (TIMEOUT, RETRY_COUNT, etc.) need no change.

### 4.2 `types/utils.ts` -- standalone, no changes needed

All 18 runtime guards and 6 type utilities are pure functions with no external dependencies. Ready to extract as-is.

### 4.3 `normalizers/*.ts` -- change import paths only

All normalizers import from `@/types` and `@/types/utils`. After extraction, these become `@im/shared-types` package imports. No logic changes needed.

### 4.4 `utils/messageNormalize.ts` -- re-export shim

Currently re-exports from `@/normalizers/message`. After extraction, this file becomes unnecessary in shared packages; apps/web can import directly from `@im/shared-normalizers`.

---

## 5. Code That Cannot Be Extracted (and why)

| Category | Files | Reason |
|----------|-------|--------|
| **Pinia stores** | All `stores/*.ts` | `defineStore`, `ref()`, `computed()` are Vue-specific reactivity primitives |
| **Services using httpClient** | All `services/*.ts` | `httpClient` is an Axios instance with browser interceptors; services call stores |
| **HTTP client** | `utils/httpClient.ts` | Axios + browser crypto + interceptor pattern |
| **Auth utilities** | `utils/auth.ts` | Uses `localStorage`, `atob`, `document` |
| **Message repo** | `utils/messageRepo.ts` | Uses `indexedDB` (browser API) |
| **Logger** | `utils/logger.ts` | Uses `import.meta.env.DEV` (Vite build-time) |
| **Common utils** | `utils/common.ts` | Uses `navigator.clipboard`, `document`, `dayjs` |
| **E2EE** | `features/e2ee/*` | Web Crypto API, IndexedDB, Vue composables |
| **Moments UI** | `features/moments/*` | Vue SFC components |
| **Chat UI** | `features/chat/*` | Vue SFC components, Element Plus |
| **Platform services** | `services/platform/*` | Capacitor APIs |
| **Heartbeat service** | `services/heartbeat.ts` | Vue ref, ElMessage, useUserStore |
| **Store modules** | `stores/modules/*` | Vue Ref types (though `message-helpers.ts` logic is mostly framework-agnostic) |

### Notable: `stores/modules/message-helpers.ts` (113 lines)

This file contains pure IM business logic:
- `MESSAGE_WINDOW_SIZE = 50`
- `messageIdentityValues`, `hasSameMessageIdentity` -- message dedup
- `messageTimeValue` -- extract numeric timestamp from Message
- `sortMessagesAscending` -- message sort
- `limitMessageWindow` -- window limiting
- `mergeMessagesChronologically` -- merge with dedup
- `findOldestLoadedServerMessageId`, `getServerMessages`

**It imports `safePreferExistingId` and `toBigIntId` from `@/normalizers/chat`**, which are in `shared-normalizers`. The only Vue coupling is the `Ref` type import in `message-loading.ts` / `message-send-queue.ts` that consume this module. The helpers file itself is framework-agnostic and could be extracted to `shared-im-core`.

---

## 6. Recommended Package Boundaries

```
frontend/packages/
  shared-types/           -- Pure TypeScript interfaces + runtime guards
  shared-normalizers/     -- DTO -> domain normalization (depends on shared-types)
  shared-api-contract/    -- Endpoint paths, business codes, WS message types, config constants
  shared-im-core/         -- IM business logic: session ID, message sort/dedup/window
  shared-auth-core/       -- Token decode, refresh coordination protocol
  shared-ws-core/         -- WS protocol constants, message types, heartbeat spec
  shared-platform-ports/  -- Interface definitions (Storage, HTTP, Logger)
  shared-utils/           -- Pure utility functions (validation, masking, formatting)
```

### Dependency graph (packages only)
```
shared-types          (no deps)
shared-api-contract   (no deps, or depends on shared-types for message type enums)
shared-im-core        depends on shared-types, shared-normalizers
shared-normalizers    depends on shared-types
shared-auth-core      depends on shared-types
shared-ws-core        depends on shared-types
shared-platform-ports (no deps, pure interfaces)
shared-utils          depends on shared-api-contract (for constants)
```

---

## 7. Candidate Source Files Per Package (with line counts)

### `shared-types` (990 lines)
| Source File | Lines | Content |
|-------------|-------|---------|
| `types/api.ts` | 46 | ApiResponse, PageRequest, PageResponse, FileUploadResponse |
| `types/user.ts` | 220 | User, Friendship, FriendRequest, UserSettings, Auth types |
| `types/message.ts` | 185 | Message, RawMessageDTO, MessageType, MessageStatus, ReadReceipt |
| `types/chat.ts` | 80 | ChatSession, WebSocketMessage, OnlineStatus, GroupReadUser |
| `types/group.ts` | 86 | Group, GroupMember, RawGroupDTO, RawGroupMemberDTO |
| `types/common.ts` | 77 | FileInfo, SearchResult, MenuItem, FormRule, EventData |
| `types/moments.ts` | 88 | MomentPost, MomentMedia, MomentLike, MomentComment, PostWithDetails |
| `types/utils.ts` | 190 | Runtime guards (isRecord, asString, asNumber, asBoolean, isMessage, etc.) + type utilities |
| `types/index.ts` | 18 | Barrel re-export |
| `types/vue-virtual-scroller.d.ts` | 7 | Vue ambient module declaration -- excluded (Vue-specific) |

### `shared-normalizers` (851 lines)
| Source File | Lines | Content |
|-------------|-------|---------|
| `normalizers/message.ts` | 269 | normalizeMessage, normalizeMessageType, normalizeMessageStatus, normalizeReadReceipt, splitTextByCodePoints |
| `normalizers/chat.ts` | 151 | normalizeConversation, buildSessionId, toBigIntId, compareIds, safePreferExistingId |
| `normalizers/user.ts` | 247 | normalizeUser, normalizeFriendship, normalizeFriendRequest, normalizeUserAuthResponse, normalizeUserSettings |
| `normalizers/group.ts` | 61 | normalizeGroup, normalizeGroupMember |
| `normalizers/friendRequest.ts` | 44 | extractFriendRequestList |
| `normalizers/moments.ts` | 79 | normalizePostWithDetails, normalizePostWithDetailsList |

### `shared-api-contract` (249 lines)
| Source File | Lines | Content |
|-------------|-------|---------|
| `config/index.ts` | 142 | API_CONFIG, WS_CONFIG, APP_CONFIG, STORAGE_CONFIG, MESSAGE_CONFIG, UI_CONFIG |
| `constants/index.ts` | 107 | MESSAGE_TYPES, MESSAGE_STATUS, FILE_TYPES, FILE_SIZE_LIMITS, API_CODES, WS_EVENTS, STORAGE_KEYS, DATE_FORMATS |

### `shared-im-core` (113+ lines)
| Source File | Lines | Content |
|-------------|-------|---------|
| `stores/modules/message-helpers.ts` | 113 | MESSAGE_WINDOW_SIZE, messageIdentityValues, hasSameMessageIdentity, messageTimeValue, sortMessagesAscending, limitMessageWindow, mergeMessagesChronologically, findOldestLoadedServerMessageId, getServerMessages, ConversationClearMarker |

### `shared-auth-core` (candidates, need interface extraction)
| Source File | Lines | Content to Extract |
|-------------|-------|--------------------|
| `services/auth-refresh.ts` | 116 | RefreshAccessTokenResult type, classifyFailureStatus logic, refreshAccessTokenCoordinated protocol (needs HTTP port injection) |
| `utils/auth.ts` | 321 | decodeAccessTokenClaims, isTokenExpired, getUserIdFromToken, getUserRolesFromToken, hasPermission, validatePasswordStrength, validateEmail, validatePhone, validateUsername, maskSensitiveInfo, AUTH_CONSTANTS (needs localStorage port injection) |

### `shared-ws-core` (candidates, need type extraction)
| Source File | Lines | Content to Extract |
|-------------|-------|--------------------|
| `types/chat.ts` (partial) | ~20 | WebSocketMessage type definition, WS message type union |
| `stores/websocket.ts` (partial) | ~30 | createTicketedWebSocketUrl function (pure, no Vue deps) |

### `shared-platform-ports` (interface definitions)
| Source File | Lines | Content |
|-------------|-------|---------|
| `services/storage/storage.service.ts` | 37 | StorageService interface (get/set/remove/clear) |
| `services/platform/app-lifecycle.service.ts` | 83 | AppLifecycleService interface (onForeground/onBackground) |
| `services/platform/network-status.service.ts` | 93 | NetworkStatusService interface (onOnline/onOffline, isOnline) |

### `shared-utils` (candidates)
| Source File | Lines | Content to Extract |
|-------------|-------|--------------------|
| `utils/common.ts` (partial) | ~150 | formatTime, formatFileSize, getFileType, isFileSizeExceeded, debounce, throttle, generateId, deepClone, isEmpty, getAvatarText (needs constants dependency) |
| `utils/auth.ts` (partial) | ~100 | validatePasswordStrength, validateEmail, validatePhone, validateUsername, maskSensitiveInfo (pure functions) |

---

## 8. Migration Risks

### 8.1 High Risk: Service Layer Coupling
All `services/*.ts` files use `@/utils/request` (httpClient) which is an Axios instance with browser-specific interceptors. The services also call normalizers inline. After extracting normalizers to a package, every service file needs import path updates. The services themselves stay in apps/web but their import paths change.

**Mitigation:** Extract types and normalizers first. Services stay in apps/web and update their imports to use the new packages.

### 8.2 High Risk: Store Module Type Coupling
`stores/modules/message-loading.ts`, `message-send-queue.ts`, `message-read.ts` all use `Vue Ref` types in their context interfaces. While the actual logic is often framework-agnostic, the type signatures are Vue-specific.

**Mitigation:** Keep store modules in apps/web. Extract only `message-helpers.ts` which has no Vue type dependency.

### 8.3 Medium Risk: config/index.ts import.meta.env
`config/index.ts` uses `import.meta.env.VITE_API_BASE_URL` and `import.meta.env.VITE_WS_BASE_URL`. These are Vite build-time replacements.

**Mitigation:** Refactor to accept env values via a `createConfig(env)` factory function, or use a simple default + override pattern. The static constants (TIMEOUT, RETRY_COUNT, etc.) need no change.

### 8.4 Medium Risk: Circular Import Risk
`websocketStore` imports `chatStore` at runtime via dynamic import to avoid circular dependency. Extracting shared packages must not introduce new circular dependencies between packages.

**Mitigation:** Enforce strict dependency order: types -> normalizers -> api-contract -> im-core. No back-references.

### 8.5 Low Risk: E2EE Feature Extraction
The E2EE feature uses Web Crypto API, IndexedDB, and Vue composables. The crypto engine (`double-ratchet.ts`, `x3dh.ts`, `crypto-primitives.ts`) is mostly framework-agnostic but uses `crypto.subtle` (browser API). Not extractable to a pure shared package without a crypto port.

**Mitigation:** Leave E2EE entirely in apps/web for now.

### 8.6 Low Risk: Test File Updates
Existing Vitest tests mock stores and services via `vi.mock()`. After package extraction, test imports need updating.

**Mitigation:** Update test imports in a dedicated step after all package extractions are complete.

---

## 9. Recommended Execution Order

### Phase 1: Extract shared-types (zero risk, zero changes to consumers)
1. Create `frontend/packages/shared-types/`
2. Copy `types/*.ts` as-is
3. Create package.json with TypeScript config
4. No consumer changes yet -- this is a standalone package

### Phase 2: Extract shared-normalizers (low risk)
1. Create `frontend/packages/shared-normalizers/`
2. Copy `normalizers/*.ts`
3. Change imports from `@/types` to `@im/shared-types`
4. Add dependency on `shared-types`

### Phase 3: Extract shared-api-contract (low risk)
1. Create `frontend/packages/shared-api-contract/`
2. Copy `constants/index.ts` as-is
3. Refactor `config/index.ts` to remove `import.meta.env` (use factory pattern)
4. Add dependency on `shared-types` (for message type enums used in MESSAGE_CONFIG)

### Phase 4: Extract shared-im-core (low risk)
1. Create `frontend/packages/shared-im-core/`
2. Copy `stores/modules/message-helpers.ts`
3. Change imports from `@/normalizers/chat` to `@im/shared-normalizers`
4. Add dependency on `shared-types`, `shared-normalizers`

### Phase 5: Extract shared-utils (medium risk)
1. Create `frontend/packages/shared-utils/`
2. Extract pure functions from `utils/common.ts` (formatTime, formatFileSize, debounce, throttle, etc.)
3. Extract validation/masking functions from `utils/auth.ts`
4. Add dependency on `shared-api-contract` (for constants)

### Phase 6: Extract shared-platform-ports (low risk)
1. Create `frontend/packages/shared-platform-ports/`
2. Extract `StorageService` interface from `services/storage/storage.service.ts`
3. Extract `AppLifecycleService` and `NetworkStatusService` interfaces

### Phase 7: Extract shared-auth-core (medium risk)
1. Create `frontend/packages/shared-auth-core/`
2. Extract token decode/validate logic from `utils/auth.ts`
3. Extract refresh protocol types from `services/auth-refresh.ts`
4. Requires injecting HTTP client and storage ports

### Phase 8: Extract shared-ws-core (low risk)
1. Create `frontend/packages/shared-ws-core/`
2. Extract WebSocketMessage type, createTicketedWebSocketUrl function
3. Extract WS protocol constants

### Phase 9: Wire up apps/web to use packages
1. Add workspace dependencies to `frontend/apps/web/package.json`
2. Update all import paths in apps/web to use `@im/shared-*` packages
3. Run typecheck, fix any issues
4. Run tests, fix any failures

---

## 10. Explicit Do-Not-Touch List

The following files/directories must NOT be moved, renamed, or have their internal logic modified during the package extraction. Only their import paths to extracted packages may change.

### Vue Components (all .vue files)
- `src/pages/*.vue` -- Login, Register, Chat, Friends, Groups, Profile, Settings, AiSettings, LogMonitor, NotFound
- `src/features/chat/**/*.vue` -- ChatContainer, ChatMessageList, ChatMessageItem, ChatComposer, ChatSidebarPanel, ChatDialogs
- `src/features/moments/**/*.vue` -- MomentsContainer, MomentsFeed, MomentsPostCard, MomentsComments, MomentsComposer, MomentsLikeBar, MomentsNotifications, MomentsUserProfile, MomentsImageViewer, MomentsVisibilityPicker
- `src/features/e2ee/composables/useE2eeSessionStatus.ts` -- Vue composable
- `src/App.vue`
- `src/main.ts`

### Pinia Stores (internal logic unchanged)
- `src/stores/chat.ts`
- `src/stores/message.ts`
- `src/stores/session.ts`
- `src/stores/user.ts`
- `src/stores/websocket.ts`
- `src/stores/contact.ts`
- `src/stores/group.ts`
- `src/stores/user-settings.ts`
- `src/stores/i18n.ts`
- `src/stores/moments.ts`

### Store Modules (internal logic unchanged)
- `src/stores/modules/message-loading.ts`
- `src/stores/modules/message-send-queue.ts`
- `src/stores/modules/message-read.ts`
- `src/stores/modules/message-search.ts`
- `src/stores/modules/message-retry.ts`

### Services (internal logic unchanged)
- `src/services/auth.ts`
- `src/services/auth-refresh.ts`
- `src/services/auth-session-adapter.ts`
- `src/services/message.ts`
- `src/services/user.ts`
- `src/services/friend.ts`
- `src/services/group.ts`
- `src/services/ai.ts`
- `src/services/file.ts`
- `src/services/heartbeat.ts`
- `src/services/moments.ts`
- `src/services/http-error-notifier.ts`
- `src/services/platform/*`
- `src/services/storage/*`

### Utils (internal logic unchanged)
- `src/utils/httpClient.ts`
- `src/utils/request.ts`
- `src/utils/messageRepo.ts`
- `src/utils/auth.ts`
- `src/utils/common.ts`
- `src/utils/logger.ts`
- `src/utils/performance.ts`
- `src/utils/upload.ts`
- `src/utils/image-compression.ts`

### Features
- `src/features/e2ee/**` -- all E2EE files
- `src/features/chat/**` -- all chat feature files
- `src/features/moments/**` -- all moments feature files

### Build/Config
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.node.json`
- `package.json` (only add workspace deps, do not change existing deps)
- `src/router/*`
- `src/styles/*`
- `src/test/*`
- `src/hooks/*`

### What IS allowed to change
- Import paths in the above files (e.g., `@/types` -> `@im/shared-types`)
- Adding workspace package dependencies to `package.json`
- Adding path aliases to `tsconfig.json` for `@im/*` packages
- The files that are BEING EXTRACTED (types/*.ts, normalizers/*.ts, config/index.ts, constants/index.ts, stores/modules/message-helpers.ts) will be COPIED to packages and their originals may become re-export shims

---

## Appendix: File Size Summary

| Category | Files | Total Lines |
|----------|-------|-------------|
| types/ | 9 | 990 |
| normalizers/ | 6 | 851 |
| config/ + constants/ | 2 | 249 |
| stores/modules/message-helpers.ts | 1 | 113 |
| **Extractable Total** | **18** | **2,203** |
| services/ | 22 | ~1,800 |
| stores/ + stores/modules/ | 14 | ~4,500 |
| utils/ | 10 | ~1,800 |
| features/e2ee/ | 24 | ~3,870 |
| **Non-extractable Total** | **70+** | **~11,970** |

**Extractable ratio:** ~15.5% of analyzed TypeScript code can move to shared packages immediately.
**With modifications (shared-utils, shared-auth-core, shared-ws-core):** ~20-25%.
