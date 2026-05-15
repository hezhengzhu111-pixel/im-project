# Frontend IM State Core Boundary

This document is the phase 3 boundary contract for message and session state
semantics. It is a design ruling for later Mimo batch changes. Do not use this
phase to rewrite WebSocket, E2EE, UI, or backend API behavior.

## Boundary Summary

| Layer | Allowed responsibility | Forbidden responsibility |
| --- | --- | --- |
| `frontend/packages/shared-im-core/src` | Pure message and session state semantics that must behave the same on Web and Mobile | API calls, persistence, notification UI, lifecycle binding, platform queues |
| `frontend/apps/web/src/stores/**` | Pinia state containers, browser persistence, Element Plus notifications, service calls, browser lifecycle wiring | Re-implement shared message/session semantic rules |
| `frontend/apps/mobile/src/stores/**` | Zustand state containers, React Native platform orchestration, service calls, upload/network/lifecycle wiring | Re-implement shared message/session semantic rules |
| `frontend/apps/mobile/src/adapters/**` | Convert between shared models and mobile-local cache/route models | Own cross-platform state semantics |

## Shared IM Core Responsibilities

`@im/shared-im-core` is the semantic kernel for IM state. Its functions must be
pure, deterministic, side-effect free, and independent from Vue, Pinia,
Zustand, IndexedDB, SQLite, MMKV, Keychain, notifications, upload services,
WebSocket clients, and API clients.

The package already owns these rules:

- `sessionId` construction: `buildSessionId` is the only cross-platform builder.
  Group sessions use `group_${groupId}`. Private sessions sort both user ids with
  `compareIds` and produce a stable two-party id.
- Message identity: `messageIdentityValues` and `hasSameMessageIdentity` compare
  `id`, `messageId`, and `clientMessageId`.
- Message sort: `messageTimeValue` and `sortMessagesAscending` sort by
  `sendTime`, with string `id` as the tie breaker.
- Message dedupe: `dedupeMessages` and `mergeMessagesChronologically` collapse
  duplicate identities while preserving a stable chronological list.
- Pending/server echo merge: `mergeServerMessageWithPending` preserves the best
  server id and carries forward `messageId` and `clientMessageId` from server
  echo or local pending message.
- Message window limit: `limitMessageWindow` sorts first, then keeps either the
  latest or oldest `MESSAGE_WINDOW_SIZE` messages.
- Server message filter: `getServerMessages` excludes `local_` ids, and
  `findOldestLoadedServerMessageId` finds the smallest server message id.
- Message-to-session resolution: `resolveMessageSessionId` maps a message to the
  stable private or group session id relative to the current user.
- Read receipt apply: `applyReadReceiptToMessages` applies private read status
  or group `readBy` state by receipt mode, message id, and read timestamp.

Phase 3 must add or formalize these rules in `@im/shared-im-core` before Web and
Mobile stores are changed to call them:

- Session sort: pinned sessions first, then descending `lastActiveTime` with
  invalid time treated as `0`.
- Session unread apply: increment unread only for non-self messages delivered to
  a non-current session; clear unread when a session is selected or marked read.
- Session `lastMessage` apply: update `lastMessage`, `lastMessageTime`, and
  `lastActiveTime` from the accepted message; preserve existing metadata that is
  not part of message application.
- Session clear apply: clearing a conversation removes `lastMessage`,
  `lastMessageTime`, sender metadata, `lastActiveTime`, and unread count for
  that session only.
- Clear marker judgment: hidden messages are those at or before the stored
  `lastServerMessageId` when both ids are valid server ids; otherwise compare
  `sendTime` to `clearedAtMs`.
- Retry backoff pure policy: given `retryCount`, `baseDelayMs`, `maxDelayMs`,
  `maxRetryCount`, and a supplied `nowMs`, return next status and
  `nextRetryAt`. The function must not read `Date.now()` internally and must
  not dispatch the retry.

## Web Store Responsibilities

Web stores remain platform orchestration and state container code.

Allowed Web responsibilities:

- Pinia `ref`, `computed`, `Map`, and array containers for runtime state.
- IndexedDB/localStorage persistence through browser repositories and storage
  keys, including pending message persistence and current-session persistence.
- Element Plus notification display such as warning messages.
- API service calls through `messageService` and related Web services.
- Browser lifecycle and network bindings such as `beforeunload`,
  `visibilitychange`, foreground, and online retry triggers.
- Actual send/read/history retry scheduling and queue chaining.
- E2EE module invocation and browser-specific deferred decryption flow.

Web stores must delegate these semantic rules to `@im/shared-im-core` after the
phase 3 helpers exist:

- Session sorting currently in `session.ts`.
- Unread increment and clear currently in `message.ts`, `session.ts`, and
  `message-read.ts`.
- `lastMessage` application currently in `session.ts`.
- Clear marker comparison currently in `message.ts`.
- Read receipt list mutation currently duplicated in `message-read.ts`.
- Pending/server echo merge and list replacement currently split across
  `message.ts`, `message-loading.ts`, and `message-send-queue.ts`.
- Message window trimming currently called from Web modules but must stay a
  shared semantic rule, not a Web-owned variant.
- Retry backoff calculation if Web adds delayed retry policy later.

## Mobile Store Responsibilities

Mobile stores remain React Native platform orchestration and state container
code.

Allowed Mobile responsibilities:

- Zustand state containers for sessions, messages, loading, and current session.
- Platform persistence through SQLite, MMKV, Keychain, or repository wrappers.
- React Native notification, upload, app lifecycle, network, and background
  retry wiring.
- API service calls through mobile `messageService` and related services.
- Actual pending queue dispatch, upload task dispatch, and retry iteration.
- Mobile model adaptation through adapters, including `serverId`,
  message-level `conversationId`, and `rawJson` as platform-local fields.
- Route handling and navigation orchestration.

Mobile stores must delegate these semantic rules to `@im/shared-im-core` after
the phase 3 helpers exist:

- Session sorting currently in `sessionStore.ts`.
- Session id inference currently split across `chatStore.ts`,
  `sessionAdapter.ts`, and `messageStore.ts`.
- `lastMessage` application currently in `messageStore.ts`.
- Unread clear currently in `sessionStore.ts`.
- Retry backoff calculation currently in `messageStore.ts`.
- Pending/server echo merge currently correctly passes through the mobile
  adapter to shared helpers; keep this path and avoid new store-local variants.
- Message list apply/sort/window semantics must remain adapter/shared-core
  calls, not handwritten in stores.

## Rules That Must Not Stay Scattered

The following rules must have one shared semantic owner and must not continue to
exist as independent Web/Mobile implementations:

| Rule | Shared owner | Current scattered locations to drain |
| --- | --- | --- |
| Session sorting | `shared-im-core` session helper | Web `session.ts`, Mobile `sessionStore.ts` |
| `unreadCount` increment/clear | `shared-im-core` session helper | Web `message.ts`, `session.ts`, `message-read.ts`; Mobile `sessionStore.ts` |
| `lastMessage` application | `shared-im-core` session helper | Web `session.ts`; Mobile `messageStore.ts` |
| Pending/server echo merge | `shared-im-core` message helper | Web `message.ts`, `message-send-queue.ts`; Mobile adapter path |
| Read receipt application | `shared-im-core` read helper | Web `message-read.ts` duplicates shared logic |
| Message window trimming | `shared-im-core` message helper | Web calls are allowed; no local variants |
| `sessionId` inference | `shared-im-core` session resolver | Web `message.ts` and Mobile `chatStore.ts` route fallbacks need to call shared helpers where domain data is available |
| Retry backoff pure calculation | `shared-im-core` retry helper | Mobile `messageStore.ts`; future Web delayed retry |
| Clear marker judgment | `shared-im-core` clear marker helper | Web `message.ts`; Mobile when conversation clear is added |

## Rules That Must Remain Platform Side

The following responsibilities must stay in Web or Mobile implementation code:

- API requests, request parameter assembly, and response fetching.
- Database or storage writes, reads, migrations, and repository batching.
- UI state such as loading flags, selected session, search results, dialogs, and
  temporary form state.
- Notification display through Element Plus, React Native notification APIs, or
  platform toasts.
- Lifecycle binding, foreground/background listeners, browser unload handling,
  network online/offline listeners, and route/navigation binding.
- Queue execution and scheduling, including actual retry loops, upload dispatch,
  lock sets, in-flight maps, and Promise tail chaining.

## Phase 3 Prohibitions

Phase 3 is a semantic-boundary extraction only. It must not:

- Change WebSocket connect, reconnect, dispatch, or event semantics.
- Change E2EE encryption, decryption, negotiation, deferred decrypt, or payload
  masking behavior.
- Change UI layout, components, user copy, or visible interaction behavior.
- Change backend endpoints, request/response contracts, or DTO compatibility.
- Change existing user-visible behavior, ordering, unread count results, retry
  timing, or message display results.

## Mimo Task Execution Boundary

For later Mimo implementation batches:

1. Add shared pure helpers first, with focused shared-im-core tests that encode
   the current Web/Mobile behavior.
2. Replace one rule family at a time in Web and Mobile. Do not combine semantic
   extraction with UI, WebSocket, E2EE, or API changes.
3. Keep adapters as model bridges only. A mobile adapter may convert local
   `MobileMessage` to shared `Message`, call a shared helper, then convert back.
4. Keep stores responsible for side effects: service calls, repository calls,
   notifications, lifecycle listeners, upload work, and queue dispatch.
5. Do not weaken TypeScript types, add `any`, relax lint/typecheck config, or
   edit generated files.
6. Preserve current behavior exactly before improving names or structure.
7. Stop a batch if Web and Mobile disagree on a rule; document the discrepancy
   and add a compatibility test before changing call sites.

## High-Risk Points

- Private session ids depend on numeric-aware `compareIds`; replacing this with
  lexicographic sorting would split conversation buckets.
- Group session ids ignore current user and must stay `group_${groupId}` across
  Web and Mobile.
- Pending/server echo merge must preserve local plaintext display for encrypted
  sender messages while still removing pending rows correctly.
- Read receipt modes are easy to invert: received receipts update messages sent
  by the target user, while sync receipts update messages not sent by the target
  user.
- Clear marker fallback switches from id comparison to timestamp comparison
  when either id is not a valid server id; local `local_` messages must not be
  treated as server ids.
- Message window trimming sorts before slicing; keeping oldest vs latest is
  caller intent and must not be collapsed.
- Retry backoff must be pure in shared-core but actual retry dispatch must stay
  platform side to preserve upload, network, and repository behavior.
- Existing dirty generated files and unrelated app changes must not be folded
  into phase 3 semantic-boundary commits.
