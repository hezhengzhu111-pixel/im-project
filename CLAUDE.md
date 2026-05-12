# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack IM (Instant Messaging) platform: Vue 3 frontend + Rust backend + Spring AI LLM microservice.

**Core topology**: Frontend → Nginx → `api-server-rs` (HTTP + WS gateway + embedded 3 background threads) → Redis Streams → `im-server-rs` (per-user WebSocket fanout). The two Rust services communicate through Redis (shared data) and HTTP (internal push API with HMAC-SHA256 signing).

**AI topology** (fast-slow separation): `api-server-rs` (auth, encrypt, validate, cache, SSE bridge) → Redis Stream `im:ai:tasks` → `spring-ai` (LLM call via Virtual Threads, streaming, RAG) → HMAC callback or Redis Pub/Sub → `api-server-rs` → normal push flow.

## Directory Structure

```
backend/
  common/            → im-rs-common: shared types (ApiResponse, ImEvent, MessageDto, Claims, JWT/HMAC, Snowflake ID, Redis key constants)
  api-server-rs/     → HTTP API (90+ routes), WS reverse proxy, embedded background pipeline (publisher/writer/dispatcher)
  im-server-rs/      → WebSocket fanout & presence service (separate process, 9 source files)
  spring-ai/         → Java 25 + Spring Boot 3.5 + Spring AI 1.1.5 LLM microservice
frontend/
  apps/web/src/stores/        → 7 Pinia stores (chat is facade orchestrator over session/message/contact/group)
  apps/web/src/services/      → API service layer (auth, user, message, friend, group, file, heartbeat, ai)
  apps/web/src/features/chat/ → Feature-based chat module (ChatContainer, ChatMessageList, ChatComposer, composables)
  apps/web/src/normalizers/   → DTO → domain object normalization (message, chat, user, group)
  apps/web/src/utils/         → request.ts (Axios+interceptors), messageRepo.ts (IndexedDB), auth.ts (JWT)
  apps/web/src/config/        → Global config (API, WS, APP, STORAGE, MESSAGE, UI constants)
  apps/web/src/types/         → TypeScript interfaces (message, chat, user, group, api)
  packages/*                 → npm workspace shared TypeScript packages
scripts/             → Python deployment & integration test tools
deploy/sit/          → docker-compose.yml (14 services: MySQL, 9 Redis, 4 app services)
sql/mysql8/          → Schema (9 databases, 17+ tables, transactional outbox pattern)
```

## Build & Development Commands

### Frontend (run from `frontend/`)

```bash
npm install          # Install all workspace dependencies and update frontend/package-lock.json
npm run web:dev      # Web dev server on port 3000, Vite proxy to api-server (VITE_GATEWAY_HOST:VITE_GATEWAY_PORT)
npm run typecheck    # Type check all packages and apps
npm run web:lint     # Web ESLint with --fix
npm run web:lint:check # Web ESLint without fix (CI-safe)
npm run test         # Run all workspace tests
npm run web:build    # typecheck + Vite build (type errors block the build)
```

### Backend Rust (run from `backend/`)

```bash
cargo build --workspace           # Build all 3 crates
cargo build -p api-server-rs      # Build API server only
cargo build -p im-server-rs       # Build IM server only
cargo test -p api-server-rs       # Run api-server tests (needs MySQL + Redis)
cargo fmt --check                 # Format check
cargo clippy -- -D warnings       # Quality gate — must pass with zero warnings
```

`im-server-rs` does NOT use workspace dependencies — it pins versions independently. When adding deps to `im-server-rs`, add them directly in its `Cargo.toml`, not the workspace table.

### Backend Spring AI (run from `backend/spring-ai/`)

Requires JDK 25 + Maven. Shell setup:
```bash
export JAVA_HOME="$HOME/local/jdk"
export PATH="$JAVA_HOME/bin:$HOME/local/maven/bin:$PATH"
```

```bash
mvn compile                  # Compile
mvn package -DskipTests      # Build fat jar
mvn test                     # Run JUnit tests
./mvnw compile               # Maven Wrapper (no local Maven needed, Docker-compatible)
```

### Deployment (run from repo root)

Copy `.env.example` → `.env` and edit secrets first.

```bash
python scripts/deploy_middleware.py          # Start MySQL + 9 Redis instances + file-volume init
python scripts/init_db.py --full             # Init 9 databases (first time or schema change)
python scripts/deploy_services.py            # Build & start all 4 services
python scripts/test.py                       # Run end-to-end integration test suite
```

Deploy a single service:
```bash
python scripts/deploy_services.py api        # Rust API server (:8082)
python scripts/deploy_services.py im         # Rust IM server (:8083)
python scripts/deploy_services.py frontend   # Nginx frontend (:80)
python scripts/deploy_services.py ai         # Spring AI (:8084)
python scripts/deploy_services.py api ai --no-build  # Skip build, use cached images
```

### Health checks

```bash
curl http://localhost:8082/health    # API server
curl http://localhost:8083/health    # IM server
curl http://localhost:8084/health    # Spring AI
curl http://localhost:80/            # Frontend
```

---

## Architecture Deep Dive

### api-server-rs — the central hub (17 modules)

`api-server-rs` is the single client-facing entry point. It owns HTTP API, WS proxy, and 3 embedded background threads:

**HTTP Handlers** (`web.rs` registers 90+ routes, every endpoint under both `/path` and `/api/path`):
- `auth_api.rs` — Token lifecycle: sign (HS512), refresh (Lua CAS on Redis JTI), parse, revoke (dual-layer: per-token blacklist + user-level `revoke_after` timestamp), WS ticket (one-time consume), internal HMAC signature validation, admin permission injection
- `user.rs` — Register/login (bcrypt, legacy plaintext compat), profile, search, heartbeat (proxied to im-server), online-status (proxied, degrades to all-offline on failure), account deletion (transactional across users/friends/groups)
- `message.rs` — Private/group send, history (cursor + page pagination), conversations, read receipts, recall/delete. Message sending uses a **Redis Lua script** for atomic multi-key write (client dedup + message store + conversation index + last message + unread counter + pending event queue)
- `social.rs` — Friend list/requests/accept/reject, group CRUD/member management. Social events go through the pending events queue for async delivery
- `file_api.rs` — 5 types (image/file/audio/video/avatar), temp-file-then-rename atomic upload, metadata in Redis, streaming download
- `ai/` — 9 sub-modules:
  - `api_key_handler` — CRUD + AES-256-GCM encrypt, `mask_key` for display, test via POST spring-ai `/api/ai/internal/test-key`
  - `settings_handler` — auto-reply toggle + persona, UPSERT MySQL + sync Redis HSET/DEL
  - `task_bridge` — `TaskType` enum (Summary/AutoReply/RagParse/RagQuery), `enqueue_task` XADD to `im:ai:tasks` MAXLEN ~10000
  - `stream_bridge` — `subscribe(task_id)` → Sse<ReceiverStream>, `spawn_blocking` sync Redis Pub/Sub, 300s total timeout, 5s read timeout
  - `summary_handler` — fetch recent messages (max 200), filter TEXT, truncate to ~16000 chars (4000 tokens), check Redis cache, enqueue Summary task
  - `auto_reply` — `maybe_trigger()` entry: check Redis HGET enabled → DB fallback → anti-reentry lock (SET NX PX 1s) → build context (last 20 messages via ZREVRANGE) → round check (20 rounds + 20s cooldown) → get persona → resolve provider/key → enqueue. **AI anti-dead-loop**: checks `is_ai_generated` flag, skips if true
  - `internal_reply` — HMAC verification → build AI MessageDto (type=AiReply, is_ai_generated=true) → `write_private_message_hot` → trigger receiver's `auto_reply`
  - `rag_handler` — upload (multipart, type check pdf/doc/docx/txt, store to /files/knowledge/{date}/, INSERT user_knowledge_docs, enqueue RagParse), list, delete, query (resolve provider/key, enqueue RagQuery)
  - `crypto` — `load_master_key(Base64)` → `[u8;32]`. `encrypt`: AES-256-GCM → Base64(nonce||ciphertext||tag). `decrypt`: min 28 bytes (12 nonce + 16 tag)

**WS Proxy** (`web.rs:tunnel_websocket`, 854 lines): Authenticates → discovers best im-server via `OnceLock<Mutex<WebSocketTargetCache>>` with TTL cache (SCAN `im:server:*`, least-connections-first) → opens upstream WS with injected gateway headers + ticket cookie → bidirectional tunnel via `tokio::select!`

**Message Lua scripts** (`message.rs`, 1979 lines — largest file):
- Private Lua: client dedup (GET+SET) + message body + conversation index (ZADD) + last message + unread counter (HINCRBY) + pending event queue (ZADD)
- Group Lua: same + INCR `conversationSeq` + `string.gsub` to replace `"conversationSeq":null` placeholder in event JSON
- FNV-1a shard routing: `FNV_OFFSET_BASIS`, `FNV_PRIME` constants, `shard_index_for_key(key, shard_count) -> usize`
- Conversations endpoint iterates all `private_hot_shards` + `group_hot_shards`, with DB fallback

**Local cache** (`local_cache.rs`): In-process LRU, `POSITIVE_TTL=60s`, `NEGATIVE_TTL=10s`, `MAX_ENTRIES=100000`, `MAX_LOCKS=10000`. `key_lock` uses `tokio::sync::Mutex` to prevent cache stampede.

**ID resolver** (`id_resolver.rs`): `JS_SAFE_INTEGER_MAX=9_007_199_254_740_991`, `JS_INTEGER_ROUNDING_WINDOW=4096`. Resolves truncated Snowflake IDs by searching ±4096 window around truncated value, returns nearest match.

**3-layer validation cache** (`message.rs`): `local_cache` → Redis → MySQL for `active_user`, `friend`, `group_member`. `preload_friend_relations` batch-loads into Redis + local_cache.

**3 Embedded Background Threads** (started via `std::thread::spawn` + `Handle::block_on`, not tokio tasks):
- `background_publisher.rs` — ZRANGEBYSCORE `im:pending:events` → batch GET event payloads → pipeline XADD to Redis Streams (private/group). Overdue/empty events auto-cleaned
- `background_writer.rs` — XREADGROUP from Streams → batch INSERT to MySQL (messages, read_cursors). Uses chunk splitting to avoid MySQL bind limits (60000). Updates db watermark in Hot Redis
- `push_dispatcher.rs` — XREADGROUP from Streams → build PushPlan (determine target user_ids) → query user routes from Redis Hash (with local TTL cache) → HTTP POST `/api/im/internal/push/batch` to im-server in parallel (FuturesUnordered, 500 users per chunk)

### im-server-rs — WebSocket fanout (9 source files)

Lightweight WebSocket push service. Entire codebase is ~1500 lines.

**Session management**: Dual-indexed in-memory HashMap — `sessions` (session_id → SessionEntry) + `user_sessions` (user_id → set of session_ids), protected by RwLock. Each SessionEntry has an `mpsc::channel` for outbound messages and `AtomicI64` for heartbeat tracking.

**Connection lifecycle**: Authenticate gateway headers → resolve WS ticket (Cookie first, query param guarded by config) → consume ticket via HTTP to auth-service → upgrade → register session → heartbeat loop (30s client, 90s server timeout, 30s cleanup scan) → unregister on disconnect.

**Slow consumer protection**: `try_send` (non-blocking) on outbound channel. Full/slow sessions collected during push, silently dropped after push completes (no offline broadcast, prevents cascade).

**Presence broadcast**: Redis Pub/Sub channel `im:presence:broadcast`. On user online/offline, publish PresenceEvent with `source_instance_id`. All instances subscribe; non-source instances broadcast locally.

**4 background tasks**: route renewal (30s), server node renewal (3s, SETEX TTL 15s), stale session cleanup (30s scan for 90s heartbeat timeout), presence subscription (continuous).

**Config defaults** (`config.rs`, 30+ fields): heartbeat_timeout=90s, session_cleanup=30s, route_lease_ttl=120s, server_lease_ttl=15s, max_payload=8KB, invalid_payload_threshold=3, outbound_channel=1024.

**Route registry** (`route.rs`): `RouteLock` uses SET NX PX 3000ms, max 20 retries at 25ms intervals. `extract_json_object` handles Redisson binary prefix bytes. Lock poison recovery via `poisoned.into_inner()`.

**Service core** (`service.rs`, 630 lines): `spawn_detached` wraps `tokio::spawn` + `catch_unwind` to prevent panic propagation. Slow consumer protection: `try_send` (non-blocking), failed sessions collected and silently dropped after push. Lock auto-recovery on poison.

### common crate — shared foundation (6 modules)

- `api.rs` — `ApiResponse<T>` / `ErrorResponse` (camelCase JSON, code/message/success/timestamp)
- `auth.rs` — JWT validation (HS512, padded 64-byte secret), `parse_bearer()`, gateway signature generation, `hmac_sha256_base64_url()`, `constant_time_eq()`
- `event.rs` — `ImEvent` envelope, `MessageDto` (with `is_ai_generated`/`ai_provider`/`ai_model` fields), `ImEventType`/`MessageType`/`MessageStatus` enums, `ReadReceipt`
  - `MessageType` enum mapping: `Text(1)`, `Image(2)`, `File(3)`, `Voice(4)`, `Video(5)`, `AiReply(6)`, `System(7)`. Methods: `from_text(&str)`, `db_code(&self) -> i32`, `as_str(&self) -> &'static str`
  - `MessageStatus`: `Sent(1)`, `Delivered(2)`, `Read(3)`, `Recalled(4)`, `Deleted(5)`
  - `ImEventType`: `MessageCreated`, `MessageRead`, `MessageRecalled`, `MessageDeleted`, `FriendRequestCreated`, `FriendRequestAccepted`
- `ids.rs` — Snowflake variant: 41-bit ms timestamp + 10-bit node_id + 12-bit sequence, `AtomicU64` CAS loop
- `keys.rs` — All Redis key patterns and TTL constants (MESSAGE_TTL=7d, EVENT_TTL=7d, CONVERSATION_TTL=7d, AI cache TTLs)
- `time.rs` — `now_ms()`, `now_iso()`, `iso_from_ms()`

### spring-ai — LLM microservice

**Task consumption**: Redis Stream `im:ai:tasks`, consumer group `im-spring-ai-workers`. `StreamMessageListenerContainer` with `autoAcknowledge=true`. Each task dispatched via `TaskRouter` to a **Virtual Thread** (`Thread.ofVirtual().name("type-taskId").start()`).

**4 task types**: `summary` (streaming), `auto_reply` (synchronous call), `rag_parse` (Tika document parsing → chunked Redis Hash storage), `rag_query` (simplified retrieval + streaming generation).

**BYOK**: `ChatClientService.forUser(provider, apiKey, modelName)` dynamically creates `OpenAiApi` → `OpenAiChatModel` → `ChatClient` per request. Supported providers: deepseek, openai, minimax.

**Streaming**: Summary and RAG query use `.stream().content()` → `Flux<String>`. Each chunk published to Redis Pub/Sub channel `im:ai:stream:sub:{taskId}` as `{"type":"chunk","content":"..."}`. Auto reply uses `.call().content()` (synchronous) with HMAC callback to `POST /api/ai/internal/reply`.

**HMAC callback** (`HmacSigner.java`): canonical = `method=POST&path=/api/ai/internal/reply&bodyHash={SHA256_BASE64(body)}&ts={ms}&nonce={uuid}`. Signature = HMAC-SHA256(internalSecret, canonical). Returns header map with X-Internal-Timestamp, X-Internal-Nonce, X-Internal-Signature.

**ReplyCallback.java**: WebClient POST to `apiServerUrl + "/api/ai/internal/reply"`. 10s timeout. Failure only logs, never throws.

**ChatClientService.java** (BYOK factory): 3 providers: `deepseek→https://api.deepseek.com`, `openai→https://api.openai.com`, `minimax→https://api.minimax.chat`. Default models: deepseek-chat, abab6.5s-chat (minimax), gpt-4o-mini (openai). temperature=0.7, maxTokens=4096. Creates new instance per call (no caching).

**SummaryHandler.java**: System prompt: "你是一个聊天记录总结助手。请用3-5个要点总结以下聊天记录...". Streaming chunks → Redis Pub/Sub. Final `{"type":"done","content":"完整文本"}`. Caches result in `im:ai:summary:{conv}:{hash}` TTL 30min.

**AutoReplyHandler.java**: Chat history format: `[senderName]: content`. System prompt: persona + "请用自然的口语回复，50字以内". Synchronous `.call().content()` → HMAC callback.

**RagParseHandler.java**: TikaDocumentReader → TokenTextSplitter (chunkSize=800, minChunkSizeChars=350, keepSeparator=true). Chunks stored in Redis Hash `im:ai:doc:{docId}:chunk:{index}` TTL 30 days. Updates `im:ai:doc:{docId}:meta` with chunkCount + parseStatus.

**RagQueryHandler.java**: Uses `KEYS im:ai:doc:*:meta` (O(N) scan) to find documents. Filters parseStatus=done. Takes first 5 chunks per document, max 5 chunks total. Builds augmented prompt: "基于以下知识库内容回答用户问题...用中文回答。" Streaming response via same Pub/Sub protocol.

### Nginx Configuration

**Location routing** (in `frontend/apps/web/nginx.conf`):
| Path | Behavior |
|------|----------|
| `/` | `try_files $uri $uri/ /index.html` — SPA fallback |
| `= /index.html` | No-cache headers |
| `/js/`, `/css/` | Immutable cache 1 year (content-hashed filenames) |
| `/files/` | `alias /data/im-files/` — local file serving, immutable 1 year |
| `/api` | Reverse proxy to `im-api-server:8082`, HTTP/1.1 + keepalive, buffering off |
| `/websocket` | Reverse proxy to `im-api-server:8082`, WS upgrade, 24h read timeout |

**Key settings**: `client_max_body_size 1200m`, upstream keepalive 2048, Docker DNS resolver with 30s refresh, `proxy_intercept_errors on` with custom JSON error page for 502.

**Missing**: No gzip compression configured, no security HTTP headers (X-Frame-Options, CSP, etc.).

### Frontend Architecture

**Store dependency graph** (Pinia):
```
chatStore (facade orchestrator — no own state)
  ├── sessionStore      会话列表、当前会话、未读计数
  ├── messageStore      消息数据、发送队列、已读、搜索
  │     └── modules/
  │           message-loading      游标/分页双策略 + IndexedDB 恢复
  │           message-send-queue   乐观更新 + 串行发送队列（同会话严格按序）
  │           message-read         已读回执（400ms 节流 + 并发锁）
  │           message-search       内存搜索（WeakMap 二级缓存）
  │           message-helpers      排序/去重/窗口限制（MESSAGE_WINDOW_SIZE=50）
  ├── contactStore      好友列表、好友请求
  └── groupStore        群组列表

userStore               认证、token、权限（独立，被所有 store 引用）
websocketStore          WS 连接、在线状态、消息分发（延迟导入 chatStore 避免循环）
userSettingsStore       用户设置
```

**chatStore 3 independent Promise tail chains** (防并发队列):
- `offlineSyncTail` — offline message sync
- `sessionRefreshTail` — session refresh (with `sessionRefreshInFlight` dedup)
- `realtimeResumeTail` — realtime resume

**Session ID**: Private `{smallerId}_{largerId}` (BigInt comparison via `toBigIntId()`), Group `group_{groupId}`.

**Token management**: Dual-layer (memory ref + localStorage). Coordinated refresh — single in-flight refresh Promise shared by all concurrent 401 requests. `sessionGeneration` counter prevents stale refresh from overwriting new session.

**Axios interceptor**: Auto-inject Authorization + X-Trace-Id + X-Gateway-Route. 401 chain: exclude auth endpoints → `refreshAccessTokenCoordinated()` → retry original request. Failed auth → clear session → redirect login. Two response formats supported: `ApiResponse<T>` (code/message/data) and `UserAuthResponse` (success/message/user).

**WS message dispatch** by `type`: `MESSAGE` (normalize → dedup via recentMessageIds 60s TTL + memory check → addMessage → desktop notification), `ONLINE_STATUS` (update Set + CustomEvent), `READ_RECEIPT`, `FRIEND_REQUEST`/`FRIEND_ACCEPTED` (debounced 1.5s refresh), `SYSTEM` (`::CMD:` protocol for forced refresh), `HEARTBEAT` (ignore).

**Message normalization**: `normalizers/message.ts` handles dual-field compatibility (camelCase + snake_case + nested objects). `normalizeMessageType` maps to whitelist with TEXT fallback. `normalizeMessageStatus` supports both numeric (1-5) and string formats. Send time priority: `created_at > createdAt > createdTime > created_time > sendTime > send_time`.

**Message persistence**: IndexedDB `im_message_repo` (key: `{convId}:s:{serverId}` or `{convId}:l:{localId}`). `requestIdleCallback` batch write for server messages. Fallback to in-memory Map if IndexedDB unavailable.

**Performance**: No true virtual scrolling. Optimization via message window limit (50), view cache based on renderDigest, short-list CSS offset, history-load scroll position restore.

### Frontend Features/Chat Module (`src/features/chat/`)

**Components**:
- `ChatContainer.vue` — Top-level orchestrator. Manages current session, unread snapshot, AI auto-reply state. Session operations menu (search/pin/mute/clear/delete). Group @member list via `groupService.getMembers`. Read receipts triggered by page visibility + focus events. AI auto-reply toggle via `aiService.getSettings/updateSettings`.
- `ChatSidebarPanel.vue` — 3-tab panel (chat/contacts/groups). 150ms search debounce. Contacts lazy-load `pinyin-pro` for alphabetical grouping. 3-level Map cache (`sessionFilterCache/contactFilterCache/groupFilterCache`) keyed by `sourceKey`.
- `ChatMessageList.vue` — Message rendering with scroll management. Key thresholds: `BOTTOM_FOLLOW_THRESHOLD=180px`, `HISTORY_TRIGGER_TOP=80px`, `READ_ACK_BOTTOM_THRESHOLD=120px`. History-load anchor restore (`restoreHistoryAnchor`). Short-list CSS `messageTopOffset`. Right-click menu (copy/recall within 2min/delete). Two-level view cache: `messageViewCache` + `messageRenderItemCache`.
- `ChatMessageItem.vue` — Single message renderer with `v-memo` on `renderDigest` + `audioPlaying`. Type branches: TEXT, AI_REPLY (with AI badge), IMAGE (lazy el-image), FILE (card), VOICE (play button), VIDEO (video tag). @highlight via `/@(\S+)/g` regex. `senderAvatarText` first-letter fallback.
- `ChatComposer.vue` — Input with toolbar (image/file/voice). Enter to send, Shift+Enter newline. @mention detection with keyboard up/down navigation. Clipboard paste auto-upload. Voice recording via `useVoiceRecorder`. `readMediaDuration` for audio/video metadata.
- `ChatDialogs.vue` — Unified dialog manager: add-friend (remote search), create-group (avatar upload + Transfer member select), group read list (async), message search (async), session info drawer (friend detail / group member list + online status).

**Composables** (`src/features/chat/composables/`):
- `useAudioPlayer` — Single-message playback (stops previous). Returns `playingMessageId`, `toggle`, `stop`.
- `useFileMessageUpload` — Upload size limits: IMAGE=20MB, FILE=512MB, VIDEO=1GB, VOICE=100MB. Dispatches to `fileService.uploadImage/uploadVideo/uploadAudio/upload`.
- `useMessageActions` — `copy` (clipboard), `recall` (API + status sync to RECALLED), `remove` (confirm + API + status sync to DELETED).
- `useMessageContextMenu` — State: `visible`, `x`, `y`, `targetMessage`.
- `useVoiceRecorder` — MIME priority: `audio/webm;codecs=opus` > `audio/webm` > `audio/ogg;codecs=opus` > `audio/mp4`. Non-HTTPS check with `allowInsecureVoiceRecording` setting. Min 1s recording.

### Frontend Services Layer (`src/services/`)

All services use `@/utils/request` Axios instance (`http`), return `ApiResponse<T>`. Each service normalizes DTOs via normalizers before returning.

| Service | Key Methods | Notes |
|---------|-------------|-------|
| `auth.ts` | `parseAccessToken` (direct axios, not http instance), `issueWsTicket`, `refreshAccessToken` | parseAccessToken bypasses interceptor |
| `auth-refresh.ts` | `refreshInFlight` singleton Promise | All concurrent 401s share single refresh. Returns `success/authInvalid/transientError` |
| `user.ts` | login, register, updateProfile, search, logout, heartbeat, checkOnlineStatus, changePassword, sendPhoneCode, bindPhone, sendEmailCode, bindEmail, deleteAccount, getSettings, updateSettings | 14 methods |
| `message.ts` | sendPrivate, sendGroup, getPrivateHistory/Cursor, getGroupHistory/Cursor, getConversations, markRead, recallMessage, deleteMessage, getConfig | 10 methods, both cursor + page pagination |
| `friend.ts` | getList, add, getRequests, handleRequest (accept/reject), delete, updateRemark | 6 methods |
| `group.ts` | create, getList, getMembers, join, quit, dismiss, update | 7 methods |
| `file.ts` | upload, uploadImage, uploadVideo, uploadAudio, delete | `resolveFilePath` parses URL → category/date/filename |
| `heartbeat.ts` | HeartbeatService singleton | 30s heartbeat + 60s status check, exponential backoff (max 3, 5s*retry). `friendsOnlineStatus` is Vue `ref` |
| `ai.ts` | listKeys, createKey, updateKey, deleteKey, testKey, getSettings, updateSettings | 7 methods |

### Frontend Types & Utilities (`src/types/`, `src/constants/`, `src/hooks/`)

**Runtime type guards** (`types/utils.ts`): 18 guard functions — `isRecord`, `asString`, `asNumber`, `asBoolean`, `isRawMessage`, `isMessage`, `isRawUser`, `isUser`, `isApiResponse`, `isFriendship`, `isFriendRequest`, `isRawGroup`, `isGroup`, `isRawGroupMember`, `isGroupMember`, `isRawConversation`, `isChatSession`, `isUserSettings`.

**Type utilities**: `PartialBy<T,K>`, `RequiredBy<T,K>`, `DeepPartial<T>`, `NonNullable<T>`.

**Key types**:
- `WebSocketMessage<TData>` — Generic WS message with types: MESSAGE, MESSAGE_STATUS_CHANGED, HEARTBEAT, ONLINE_STATUS, READ_RECEIPT, READ_SYNC, SYSTEM, FRIEND_REQUEST, FRIEND_ACCEPTED
- `ReadReceipt` — `{readerId, toUserId?, conversationId?, lastReadMessageId?, lastReadSeq?, readAt?}`
- `MessageSearchResult` — `{message, highlight, context}`
- `GroupReadUser` — `{userId, displayName}`
- `FileUploadResponse` — 12+ fields with dual-case compatibility

**Constants** (`constants/index.ts`):
- `FILE_SIZE_LIMITS`: IMAGE=10MB, VIDEO=100MB, AUDIO=20MB, DOCUMENT=50MB
- `PAGINATION.MESSAGE_SIZE=50`
- `API_CODES`, `WS_EVENTS`, `STORAGE_KEYS`, `DATE_FORMATS`

**Hooks** (`hooks/useErrorHandler.ts`): `capture(error, fallbackMessage, {silent?})` → ElMessage error 2400ms. `notifyInfo`/`notifySuccess` → 1600ms.

### Frontend Style System (`src/styles/`)

**`variables.scss`** — Color system: `$primary-color: #409eff` with 9 light + 2 dark variants. Semantic colors (success/warning/danger/info). Text colors (primary/regular/secondary/placeholder). Chat-specific: `$chat-message-own-bg`, `$chat-online-color`. Status colors: online/offline/away/busy/invisible. Dark theme: `$dark-bg-color`. Spacing: 4px-24px. Avatar sizes: 24px-60px. Sidebar width: 280px. Mixins: `respond-to($breakpoint)`, `text-ellipsis($lines)`, `flex-center/between/start/end`, `absolute-center`, `card-style`, `input-style`, `scrollbar-style`.

**`chat-theme.scss`** — CSS custom properties for chat UI: `--chat-shell-bg` (gradient), `--chat-panel-bg` (rgba 0.72), `--chat-accent` (#2563eb), `--chat-bubble-own` (blue 0.92), `--chat-bubble-other` (white 0.86), `--chat-glass-blur` (blur 18px), `--chat-max-bubble-width` (min 72% 640px). Dark theme via `body.theme-dark` selector. Global classes: `.chat-glass-surface`, `.chat-soft-scrollbar`, `.chat-action-button`, `.ai-badge`.

**`glassmorphism.scss`** — Design tokens: `$glass-bg-light: rgba(255,255,255,0.65)`, `$glass-blur: blur(12px)`, `$flat-radius: 16px`. Mixins: `glass-effect($is-dark)`, `modern-card` (hover float effect).

**`index.scss`** — Global entry: CSS reset, utility classes (flex/text/spacing 0-10/display/position/overflow/rounded/shadow/transition), responsive utilities (xs/sm/md/lg/xl hidden/block), Element Plus overrides (button/input/card/dialog/message/notification/menu), chat layout styles, message item styles, animations, print styles, high-contrast mode, reduced-motion mode.

### Frontend Page Components (`src/pages/`)

| Page | Route | Key Features |
|------|-------|-------------|
| `Chat.vue` | `/chat` | Renders `<ChatContainer />` only |
| `Login.vue` | `/login` | Username 3-20 chars (alphanumeric underscore), "remember me", redirect param |
| `Register.vue` | `/register` | Username 3-20, email format, password 8-64 (must have letter+number), terms checkbox |
| `Friends.vue` | `/contacts` | 3 search modes (username/email/phone), 3 sort modes (name/time/online), friend request display via `features/contacts/requestDisplay.ts` |
| `Groups.vue` | `/groups` | 3 sort modes (name/time/member count), create group with avatar upload + Transfer member select |
| `Profile.vue` | `/profile` | Avatar upload, profile edit, privacy settings, phone/email bind status |
| `Settings.vue` | `/settings` | Theme toggle (body class + localStorage), language switch (zh-CN/en-US), notification/sound/read-receipt toggles, voice recording permission, cache clear, AI settings link |
| `AiSettings.vue` | `/settings/ai` | API Key CRUD (DeepSeek/MiniMax/OpenAI), test connection, auto-reply toggle, persona editor (500ms debounce save) |
| `LogMonitor.vue` | `/admin/logs` | SSE `/api/logs/stream`, regex log parsing (timestamp/level/TraceId/service/message), keyword + level filter, max 1000 entries, clickable TraceId |
| `NotFound.vue` | `/:pathMatch(.*)*` | SVG illustration + fade-in animation, back/home/refresh buttons, help link grid |

**App initialization** (`App.vue`): `initApp` → userStore → if logged in → chatStore.initChatBootstrap() + webSocketStore.connect(). Watch `isLoggedIn` for auto init/reset. `handleVisibilityChange` auto-reconnects WS. `handleBeforeUnload` disconnects WS.

**Router** (`router/index.ts`): Guard chain: `ensureAuthenticated()` → auth check → permission check → hideForAuth redirect. Chunk load error auto-recovery via sessionStorage marker + `_r` timestamp retry.

### Frontend Config Constants (`src/config/index.ts`)

| Config | Key Values |
|--------|-----------|
| `API_CONFIG` | BASE_URL=`/api`, TIMEOUT=10000, RETRY_COUNT=3 |
| `WS_CONFIG` | RECONNECT_ATTEMPTS=5, RECONNECT_INTERVAL=1000, HEARTBEAT_INTERVAL=30000 |
| `APP_CONFIG` | PAGE_SIZE=20, MAX_FILE_SIZE=10MB |
| `MESSAGE_CONFIG` | MAX_TEXT_LENGTH=1000, CACHE_SIZE=100 |
| `UI_CONFIG` | SIDEBAR_WIDTH=280, CHAT_MIN_WIDTH=400, MESSAGE_MAX_WIDTH=400 |
| `STORAGE_CONFIG` | Keys: `im_access_token`, `im_user_snapshot`, `im_ws_cache`, `im_heartbeat`, `im_chat_cache`, `im_chat_clear_markers`, `im_settings` |

**Known inconsistency**: `MESSAGE_CONFIG.TYPES` lacks `"AI_REPLY"` but `types/message.ts` MessageType includes it. The normalizer whitelist is correct.

---

## Redis Architecture

### 6 Logical Connections

| Connection | Env Var | Default | Purpose |
|-----------|---------|---------|---------|
| Cache | `IM_CACHE_REDIS_URL` | `redis://127.0.0.1:6379/0` | Validation cache, group members, friend relations, AI settings |
| Private Hot | `IM_PRIVATE_HOT_REDIS_URLS` | shared with cache | Private message hot data (messages, conversations, unread, read cursors). N shards |
| Group Hot | `IM_GROUP_HOT_REDIS_URLS` | shared with cache | Group message hot data. N shards |
| Private Event | `IM_PRIVATE_EVENT_REDIS_URL` | shared with cache | Private event stream |
| Group Event | `IM_GROUP_EVENT_REDIS_URL` | shared with cache | Group event stream |
| Route | `IM_ROUTE_REDIS_URL` | shared with cache | User route registry, server node registration |

Shard routing: FNV-1a hash on `conversation_id % shard_count`. Hot shard count controlled by `IM_PRIVATE_HOT_SHARDS` / `IM_GROUP_HOT_SHARDS` (default 1 for SIT, 4 for production).

### Key Patterns (all defined in `common/src/keys.rs`)

| Pattern | Type | TTL | Usage |
|---------|------|-----|-------|
| `im:msg:{id}` | String(JSON) | 7d | Message body |
| `im:conv:{conv}:msgs` | SortedSet(score=mid) | 7d | Conversation message index |
| `im:conv:{conv}:last` | String(JSON) | 7d | Last message |
| `im:user:{uid}:convs` | SortedSet(score=ts) | 7d | User conversation list |
| `im:user:{uid}:unread` | Hash(field=conv) | 7d | Unread counters |
| `im:read:{uid}:{conv}` | String(JSON) | 7d | Read cursor |
| `im:conv:g_{gid}:seq` | String(int) | ∞ | Group message sequence |
| `im:readseq:{uid}:g_{gid}` | String(int) | ∞ | Group read sequence |
| `im:pending:events` | SortedSet(score=ts) | ∞ | Pending event queue |
| `im:event:{id}` | String(JSON) | 7d | Event payload cache |
| `im:client:{sid}:{cid}` | String(mid) | 14d | Client message dedup |
| `im:db:watermark:{conv}` | String(int) | ∞ | DB write watermark |
| `im:cache:*` | various | 60-300s | Validation cache (active_user, friend, group_member) |
| `im:route:users` | Hash(field=uid) | -- | User → server routing table |
| `im:route:users:lock:{uid}` | String(UUID) | 3s | Distributed lock for route updates |
| `im:server:{id}` | String(JSON) | 15s | Server node registration |
| `im:presence:broadcast` | Pub/Sub channel | -- | Online/offline status broadcast |
| `im:ai:tasks` | Stream | ~100k | AI task queue |
| `im:ai:stream:sub:{taskId}` | Pub/Sub channel | -- | AI streaming response |
| `im:ai:summary:{conv}:{hash}` | String | 30min | Summary cache |
| `im:ai:auto_reply:{uid}` | Hash | 3600s | Auto-reply config |
| `im:ai:antireentry:{uid}:{conv}` | String | 1s | Anti-reentry lock |

### Message Flow (complete path)

```
Client POST /message/send/private
  → api-server-rs message::send_private()
    → Lua script atomic write to Hot Redis:
        SET client dedup key
        SET message body
        ZADD conversation messages index
        SET conversation last message
        ZADD pending events queue
        SET event payload cache
        ZADD user conversations
        HINCRBY receiver unread
    → [async] ai::auto_reply::maybe_trigger()

background_publisher (std::thread)
  → ZRANGEBYSCORE pending events → batch GET payloads → pipeline XADD Redis Streams

background_writer (std::thread)
  → XREADGROUP → batch INSERT MySQL (messages, read_cursors) → update db watermark

push_dispatcher (std::thread)
  → XREADGROUP → build PushPlan → query user routes → HTTP POST /api/im/internal/push/batch
    → im-server-rs → WebSocket push to online clients
```

---

## Database Schema

9 databases, no physical foreign keys (cross-database microservice architecture). All references are logical, enforced by application layer. All tables use `utf8mb4` / `utf8mb4_0900_ai_ci`.

### service_user_service_db

**`users`**: id(BIGINT PK), username(VARCHAR(50) UNIQUE), password(VARCHAR(255) BCrypt), nickname, avatar(VARCHAR(500)), phone, email, status(TINYINT 1=normal/0=disabled), last_login_time, im_token(VARCHAR(500)), im_server_url, created_time, updated_time. Indexes: username(UK), status, last_login_time.

**`im_friend`**: id(BIGINT PK), user_id, friend_id, remark, status(TINYINT 1=normal/2=deleted/3=blocked). Indexes: (user_id, friend_id)(UK), (user_id, status), friend_id.

**`friend_request`**: id(BIGINT PK), applicant_id, target_user_id, status(INT 0=pending/1=accepted/2=rejected), apply_time, apply_reason(VARCHAR(200)), reject_reason, handle_time. Indexes: (target_user_id, status), applicant_id.

**`user_settings`**: user_id(BIGINT PK), privacy_settings(JSON), message_settings(JSON), general_settings(JSON).

**`user_ai_api_keys`**: id(BIGINT PK), user_id, provider(VARCHAR(32) deepseek/minimax), encrypted_api_key(VARCHAR(512) AES-256-GCM), key_name, is_active(TINYINT), last_validated_at(BIGINT epoch ms), validate_status(VARCHAR(32) ok/invalid/insufficient/error). Index: (user_id, provider).

**`user_ai_settings`**: user_id(BIGINT PK), auto_reply_enabled(TINYINT), auto_reply_persona(TEXT).

**`user_knowledge_docs`**: id(BIGINT PK), user_id, group_id(NULL=personal), file_name(VARCHAR(256)), file_type(VARCHAR(32) pdf/docx/txt), file_size(BIGINT), oss_url(VARCHAR(512)), chunk_count(INT), parse_status(VARCHAR(32) pending/parsing/done/failed). Indexes: user_id, group_id.

### service_group_service_db

**`im_group`**: id(BIGINT PK), name(VARCHAR(100)), avatar, announcement(TEXT), owner_id, type(INT 1=normal/2=public), max_members(INT default 500), member_count(INT), status(TINYINT). Indexes: owner_id, status.

**`im_group_member`**: id(BIGINT PK), group_id, user_id, nickname, role(INT 1=member/2=admin/3=owner), status(TINYINT), join_time. Indexes: (group_id, user_id)(UK), group_id, user_id.

### service_message_service_db

**`accepted_message`** — Idempotency table: id(BIGINT PK), sender_id, client_message_id(VARCHAR(64)), conversation_id(VARCHAR(64)), ack_stage(VARCHAR(32) default ACCEPTED), payload_json(LONGTEXT). Index: (sender_id, client_message_id)(UK).

**`message_outbox`** — Transactional outbox: id(BIGINT PK, aligned with message ID), sender_id, client_message_id, conversation_id, topic(VARCHAR(100)), routing_key, event_json(LONGTEXT), dispatch_status(VARCHAR(32) PENDING→RETRY→DISPATCHED→PERSISTED), attempt_count(INT), next_attempt_time, last_error, dispatched_time. Indexes: (sender_id, client_message_id)(UK), (dispatch_status, next_attempt_time), (conversation_id, created_time).

**`message_state_outbox`** — Status events: id(BIGINT PK), idempotency_key(VARCHAR(160) UK), event_type(VARCHAR(32) READ/STATUS_CHANGE), topic, routing_key, payload_json, dispatch_status(PENDING/DISPATCHING/RETRY/DISPATCHED), attempt_count, next_attempt_time.

**`messages`** — Hot storage (90 days): id(BIGINT PK), conversation_seq(BIGINT NULL, group sequence), sender_id, receiver_id(NULL for group), group_id(NULL for private), client_message_id, message_type(INT), content(TEXT), media_url, media_size, media_name, thumbnail_url, duration(INT seconds), location_info, status(INT 1-5), is_group_chat(TINYINT), reply_to_message_id. Indexes: (sender_id, client_message_id)(UK), (sender_id, created_time), (receiver_id, sender_id, status), (group_id, created_time), (group_id, conversation_seq), reply_to.

**`messages_archive`** — Cold storage, same schema + `archived_time`.

**`message_read_status`**: id(BIGINT PK), message_id, user_id, read_at. Index: (message_id, user_id)(UK).

**`pending_status_event`** — Out-of-order buffer: id(BIGINT PK), message_id, new_status(INT), changed_at, payload_json. Index: (message_id, new_status)(UK).

**`group_read_cursor`**: id(BIGINT PK), group_id, user_id, last_read_seq(BIGINT default 0), last_read_message_id, last_read_at. Index: (group_id, user_id)(UK).

**`private_read_cursor`**: id(BIGINT PK), user_id, peer_user_id, last_read_at. Index: (user_id, peer_user_id)(UK).

### Migration Scripts

`sql/mysql8/20260417_upgrade_message_outbox_to_durable_schema.sql` — Uses dynamic SQL (PREPARE/EXECUTE) for idempotent column additions. Migrates old payload/event_type/targets_json columns to new sender_id/client_message_id/conversation_id/routing_key/event_json/dispatch_status. Data extracted from existing payload JSON.

### Outbox State Machine

```
accepted_message (dedup INSERT)
  → message_outbox (PENDING)
    → background_writer picks up → RETRY (on failure, exponential backoff)
      → DISPATCHED (after Stream publish)
        → PERSISTED (after MySQL INSERT confirmed)
```

---

## Environment Variables

### 3-Level Pass-Through Chain

```
System env (highest priority)
  → Root .env (loaded by scripts/deploy_utils.py, skips already-set vars)
    → Docker Compose YAML ${VAR:-default} substitution
      → Container environment variables
```

### Frontend Vite Build Modes

`FRONTEND_BUILD_MODE` build arg controls which `.env.*` file Vite loads:

| Mode | Debug | PWA | Analytics | Error Reporting | CSP |
|------|-------|-----|-----------|----------------|-----|
| development | true | false | false | false | false |
| sit | false | true | false | false | false |
| production | false | true | true | true | true |

`VITE_GATEWAY_HOST` / `VITE_GATEWAY_PORT` only defined in `.env.sit` and root `.env` for dev proxy.

### Key Config Variables

| Category | Variable | Default | Service |
|----------|----------|---------|---------|
| DB | `MYSQL_ROOT_PASSWORD` | `root123` | mysql, api-server |
| Cache | `REDIS_PASSWORD` | `root123` | all Redis, server, api, ai |
| Auth | `JWT_SECRET` | 32-byte HS512 | api-server |
| Auth | `AUTH_REFRESH_SECRET` | 32-byte | api-server |
| Auth | `IM_INTERNAL_SECRET` | 32-byte | api-server, spring-ai |
| Auth | `IM_GATEWAY_AUTH_SECRET` | 48-byte | api-server, im-server |
| AI | `IM_AI_ENCRYPTION_KEY` | AES-256-GCM Base64 | api-server |
| Shards | `IM_PRIVATE_HOT_SHARDS` | 1 (SIT) / 4 (prod) | api-server |
| Shards | `IM_GROUP_HOT_SHARDS` | 1 (SIT) / 4 (prod) | api-server |

### Deployment Scripts (`scripts/`)

Six deployment entry scripts are kept: `docker_clean.py`, `generate_env.py`, `deploy_middleware.py`, `init_db.py`, `deploy_services.py`, and `test.py`. Shared helper code lives in `deploy_utils.py`.

**`docker_clean.py`**: removes one container/image by name or id, or performs a confirmed full Docker reset with `--full --yes`.

**`generate_env.py`**: generates root `.env` and the matching frontend env file for `--dev`, `--sit`, or `--prd`; existing non-placeholder secrets are preserved unless `--force-secrets` is used.

**`deploy_middleware.py`**: Checks MySQL + Redis + N private-hot + N group-hot + im-files-init, starts only missing or unready middleware, then waits for readiness; im-files-init waits for completion.

**`deploy_services.py`**: Service aliases: `api/api-server→im-api-server`, `im/im-server→im-server`, `frontend→im-frontend`, `ai/spring-ai→im-spring-ai`. `_hot_urls()` dynamically generates comma-separated Redis URL list based on shard count. Supports `--no-build`, `--pull`, `--no-deps`, `--with-deps`, `--skip-middleware-check`.

**`init_db.py`**: `--full` mode: stops app services → parses CREATE DATABASE from SQL → DROP each → imports full SQL via docker exec stdin.

**`test.py`**: `ApiClient` HTTP client with cookie management, JSON handling, Bearer auth, and root `.env` loading. Tests: health → register 3 users → seed relationships via MySQL direct insert → login → auth chain (parse/refresh/introspect/permission/ws-ticket) → user profile → phone/email bind → password change → heartbeat → friends → groups → files → messages (private + WS push verification) → group messages → WS heartbeat → account cleanup. WebSocket implementation: pure socket handshake + frame parsing (masked frame, 2-byte/8-byte length). Internal HMAC signing: `method={}&path={}&bodyHash={SHA256_BASE64}&ts={ms}&nonce={uuid}`.

### Hot Shard Port Mapping

| Shard | Private Hot Port | Group Hot Port |
|-------|-----------------|----------------|
| 1 | 6384 | 6383 |
| 2 | 6385 | 6386 |
| 3 | 6387 | 6389 |
| 4 | 6388 | 6390 |

### Nginx Main Config (`frontend/apps/web/nginx-main.conf`)

`worker_processes auto`, `worker_rlimit_nofile 200000`, `worker_connections 65535`, `multi_accept on`, `keepalive_timeout 300s`, `keepalive_requests 100000`, `server_tokens off`.

Deployment entry scripts are intentionally limited to `docker_clean.py`, `generate_env.py`, `deploy_middleware.py`, `init_db.py`, `deploy_services.py`, and `test.py`. Shared helper code lives in `deploy_utils.py`.

---

## Error Handling

### api-server-rs Error Codes

| Code | Constant | Meaning |
|------|----------|---------|
| 40104 | `INTERNAL_AUTH_REJECTED_CODE` | Internal HMAC signature rejected |
| 40109 | `WS_TICKET_INVALID_CODE` | WS ticket invalid or expired |
| 40110 | `WS_QUERY_TICKET_NOT_ALLOWED_CODE` | Query-param WS ticket not allowed |

Internal errors (Redis/Http/Other) return generic 500 to client; details logged server-side via `tracing`.

### im-server-rs Error Codes

Uses HTTP status codes directly (400/401/403/404/409/502/500). No custom business error codes.

### Observability

`api-server-rs` logs structured observations to target `im_observe`:
- `db_query` — async DB query wrapper with timing (DEBUG)
- `cache_fallback` — Redis miss → DB fallback events (INFO)
- `writer_flush` — background writer batch flush stats (DEBUG)
- `pending_events` — event queue backlog (DEBUG)

---

## Testing

### Backend Integration Tests (`backend/api-server-rs/tests/`)

| File | Tests | Coverage |
|------|-------|----------|
| `auth_integration.rs` | 10 | Register (success/duplicate/weak/empty), login (success/wrong/not-found), refresh (success/expired), parse |
| `message_integration.rs` | 14 | Private/group send, history (cursor/pagination/empty), mark-read, recall/delete (own/other), conversations |
| `user_social_integration.rs` | 22 | Profile update, phone/email verify+bind, account delete, search, friend request/accept/list/delete, group create/join/list/disband |

Tests use `tower::ServiceExt::oneshot` for in-process HTTP testing. Need running MySQL + Redis. Usernames generated with `AtomicU64` counter + timestamp for uniqueness.

### Frontend Tests (`frontend/apps/web/src/test/`)

| File | Tests | Focus |
|------|-------|-------|
| `chat-store.spec.ts` | 19 | Message sort, history loading (cursor/page), session ops, read receipts, send queue, text splitting |
| `websocket-store.spec.ts` | 8 | WS ticket, reconnect, online status, message dedup, system commands, contact refresh debounce |
| `user-auth-store.spec.ts` | 9 | Login/register/logout, token recovery (persisted+cookie+refresh), unsigned JWT rejection |
| `request-refresh.spec.ts` | 7 | 401 auto-refresh retry, concurrent 401 sharing, refresh failure cleanup, sessionGeneration guard |
| `router-guard.spec.ts` | 4 | Unauthenticated redirect, authenticated away from login, public page pass, permission block |
| `chat-container.spec.ts` | 5 | Session ops menu, session info drawer, group member online status |
| `chat-sidebar-panel.spec.ts` | 2 | Search debounce (150ms), pinyin initial cache |
| `chat-message-list-scroll.spec.ts` | 4 | History scroll restore, new message visibility, media loaded stability, unread divider |
| `message-item-align.spec.ts` | 3 | Self/other message alignment |
| `message-item-image-lazy.spec.ts` | 3 | Image lazy loading, system message, file/voice card |
| `message-normalizer.spec.ts` | 2 | snake_case normalization, VOICE/IMAGE mediaUrl fallback |
| `friends-page.spec.ts` | 3 | Friend request display name/avatar, pending incoming |
| `file-service.spec.ts` | 8 | Upload metadata, file path parsing, delete API, invalid path rejection |

Mock patterns: Element Plus full mock, store-to-store mock, `vi.hoisted()`, `FakeWebSocket`, Axios request/response queue, `vi.useFakeTimers()` for debounce testing.

---

## Rust Coding Rules (compile-enforced)

All three crates have these lints at the top of `main.rs`/`lib.rs`. Code violating any of these **will not compile**:

- `#![forbid(unsafe_code)]` — No unsafe blocks, raw pointers, FFI
- `#![deny(clippy::unwrap_used)]` / `#![deny(clippy::expect_used)]` — Use `?`, `match`, or `.ok_or_else()`
- `#![deny(clippy::indexing_slicing)]` — Use `.get()` or iterators
- `#![deny(clippy::panic)]` / `#![deny(clippy::todo)]` / `#![deny(clippy::unimplemented)]` — No panics or todos
- `#![deny(clippy::as_conversions)]` — Use `From`/`TryFrom`, not `as` casts
- `#![deny(unused_must_use)]` — All `Result` and `Option` must be consumed

Integer arithmetic: prefer `checked_*`, `saturating_*`, or `wrapping_*` over bare operators. Must use **stable Rust** — no `#![feature(...)]`.

## Frontend Conventions

- **SCSS auto-import**: Every `.vue` `<style lang="scss">` automatically has `@use "@/styles/variables.scss" as *;` injected via Vite config. Never add that import manually.
- **Build target**: ES2020. Don't use ES2021+ syntax in frontend code.
- **Tests**: Vitest with jsdom, Pinia stores mocked via `vi.mock()`, globals imported from `apps/web/src/test/setup.ts`. Test files: `*.spec.ts` under `frontend/apps/web/src/test/`.
- **Path alias**: `@` → `src/` directory.
- **Facade store pattern**: `chatStore` is the single entry point for components. It orchestrates `sessionStore`, `messageStore`, `contactStore`, `groupStore`. Components should not directly depend on the inner stores.
- **WS circular import**: `websocketStore` imports `chatStore` at runtime via `import("@/stores/websocket")` to avoid circular dependency. Do not use top-level import.
- **Message send queue**: Messages within the same session are sent serially (Promise chain). Cross-session messages are parallel. Optimistic update with `local_` prefix temp IDs, replaced on server response.
- **Dual-field compatibility**: Backend returns both camelCase and snake_case fields. Normalizers in `src/normalizers/` handle the mapping. Always use normalizer output, never raw DTO fields directly.
- **BigInt IDs**: Snowflake IDs exceed `Number.MAX_SAFE_INTEGER`. Use `toBigIntId()` from `normalizers/chat.ts` for comparison. Pass IDs as strings where possible.

## Environment Files

- Root `.env` — Docker Compose, deployment scripts, backend runtime (loaded by `scripts/deploy_utils.py`)
- `frontend/.env.*` — Vite build-time env (only `VITE_*` prefixed vars exposed to browser)
- Frontend dev proxy target: `VITE_GATEWAY_HOST` / `VITE_GATEWAY_PORT`

## Key Quirks

- **Redis sharding**: Hot data uses N Redis instances per type (private/group). FNV-1a hash on conversation_id determines shard. Shard count: `IM_PRIVATE_HOT_SHARDS` / `IM_GROUP_HOT_SHARDS` (SIT=1, prod=4).
- **Lua atomic writes**: Message sending uses Redis Lua scripts for atomic multi-key operations. Group message `conversationSeq` is generated via INCR inside Lua, with string replacement of `"conversationSeq":null` placeholder.
- **JS integer precision**: Snowflake IDs can exceed `Number.MAX_SAFE_INTEGER`. `id_resolver.rs` searches a ±4096 window around truncated IDs. Frontend sends IDs as strings where possible.
- **Docker images use Chinese mirrors**: Base images prefixed with `docker.m.daocloud.io/library/`. Dockerfile npm registry is `registry.npmmirror.com`.
- **im-server needs OpenSSL at runtime**: `im-server-rs` Dockerfile installs `libssl3`; `api-server-rs` does not (uses pure Rust TLS).
- **AI API keys never stored in plaintext**: AES-256-GCM encrypted in MySQL by Rust, decrypted in-memory only by Spring AI via task payload.
- **AI anti-dead-loop**: AI-generated messages carry `is_ai_generated: true` + `message_type: "AI_REPLY"`. Auto-reply checks this flag to prevent triggering AI on AI messages.
- **AI anti-reentry**: Redis SET NX with 1s TTL prevents concurrent auto-reply for same user+conversation. 20-round limit per conversation with 20s cooldown.
- **Token refresh CAS**: Refresh token JTI stored in Redis, updated via Lua CAS script to prevent concurrent refresh races.
- **Token revocation**: Dual-layer — per-token blacklist (`auth:revoked:token:{hash}`) + user-level `revoke_after` timestamp.
- **Background threads not tokio tasks**: Publisher/writer/dispatcher use `std::thread::spawn` + `Handle::block_on()` to avoid blocking the tokio runtime.
- **RAG limitation**: Current RAG retrieval uses `KEYS` command (O(N)) and takes first N chunks — no vector similarity search. Simplified implementation.
- **Message archive**: `messages` table is hot (90 days), `messages_archive` is the cold storage with same schema + `archived_time`.
- **All containers use non-root**: Dockerfiles create `appuser` (UID 10001). `im-files-init` sets ownership to 10001:10001.
- **ulimits**: All containers set `nofile: soft=200000, hard=200000`.
- **Application services have no Docker healthcheck**: Only MySQL and Redis have Docker-level health checks. App service readiness is verified by deploy scripts polling container status.

## Generated Files (don't edit)

- `frontend/apps/web/auto-imports.d.ts` — unplugin-auto-import
- `frontend/apps/web/components.d.ts` — unplugin-vue-components
- `frontend/apps/web/dist/` — build output
- `backend/spring-ai/target/` — Maven build output (gitignored)
- `backend/spring-ai/mvnw` / `mvnw.cmd` / `.mvn/` — Maven Wrapper (committed intentionally)

## Workflow

Auto-commit after every fix: after completing any fix or change, stage and commit with a descriptive message immediately.
