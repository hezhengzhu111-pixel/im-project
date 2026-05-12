# AGENTS.md

## Workflow

- **Auto-commit after every fix**: After completing any fix or change, automatically stage and commit with a descriptive message. Do not wait for the user to ask — commit immediately once the fix is verified.

## Architecture

This is a full-stack IM (Instant Messaging) application:

- **`backend/`** — Rust Cargo workspace with 3 crates + Spring AI microservice:
  - `im-rs-common` (`backend/common/`) — shared types, JWT/HMAC helpers
  - `api-server-rs` (`backend/api-server-rs/`) — HTTP API (auth, user, file, message, AI), embedded push dispatcher, WebSocket gateway
  - `im-server-rs` (`backend/im-server-rs/`) — WebSocket fanout & presence service (separate runtime from api-server)
  - `spring-ai` (`backend/spring-ai/`) — **Java 25 + Spring Boot 4 + Spring AI 1.1** LLM microservice (Redis Stream consumer, BYOK, streaming)
- **`frontend/`** — Vue 3 + TypeScript + Vite + Element Plus + Pinia SPA
- **`scripts/`** — Python deployment & integration test tools
- **`deploy/sit/docker-compose.yml`** — full SIT stack definition (MySQL, 13 Redis shards, 3 backend services, Nginx frontend)
- **`sql/mysql8/init_all.sql`** — schema (9 databases, message outbox pattern, 3 AI tables)

Key topology: Frontend → Nginx → `api-server-rs` (HTTP + WS gateway) → Redis Streams (`im:events`) → embedded dispatcher → `im-server-rs` (per-user WebSocket fanout). `api-server-rs` and `im-server-rs` are separate processes that communicate through Redis and HTTP.

### AI / LLM topology

AI tasks follow a "fast-slow separation" pattern:

```
Frontend → api-server-rs (fast: auth, encrypt, validate, cache, SSE bridge)
                │
                ▼ XADD im:ai:tasks
          Redis Stream
                │
                ▼ XREADGROUP
         spring-ai (slow: LLM call, streaming, RAG)
                │
        ┌───────┴───────┐
        ▼               ▼
   Pub/Sub chunks    HMAC callback
   → SSE frontend    → api-server-rs
                        → inject MessageDto
                        → normal push flow
```

- **BYOK (Bring Your Own Key)**: User API keys are AES-256-GCM encrypted in MySQL by Rust, decrypted in-memory per-request by Spring AI via `OpenAiApi.mutate()`.
- **Virtual Threads**: Spring AI uses `Thread.ofVirtual()` for unlimited concurrent AI tasks (Java 25).
- **AI message indentifier**: All AI-generated messages carry `is_ai_generated: true` + `message_type: "AI_REPLY"` for dead-loop defense.

## Workspace dependency note

`im-server-rs` does **not** use workspace dependencies — its `Cargo.toml` pins versions independently. `api-server-rs` and `common` use `[workspace.dependencies]` from `backend/Cargo.toml`. When adding a crate-level dep to `im-server-rs`, add it directly there, not to the workspace table.

## Commands

### Frontend (run from `frontend/`)

| Command | What it does |
|---------|-------------|
| `npm install` | Install all workspace dependencies and update `frontend/package-lock.json` |
| `npm run web:dev` | Web dev server on port 3000 with Vite proxy to api-server (reads `VITE_GATEWAY_HOST` / `VITE_GATEWAY_PORT` from `.env.*`) |
| `npm run typecheck` | Type check all packages and apps |
| `npm run web:lint` | Web ESLint with `--fix` |
| `npm run web:lint:check` | Web ESLint without fix (CI-safe) |
| `npm run test` | Run all workspace tests |
| `npm run web:build` | Full web build: **typecheck first**, then Vite build. Type errors block the build. |

Frontend tests use `jsdom`, mock Pinia stores with `vi.mock()`, and import `vitest` globals from `apps/web/src/test/setup.ts`. Test files live under `frontend/apps/web/src/test/` with the pattern `*.spec.ts`.

### Backend Rust (run from `backend/`)

| Command | What it does |
|---------|-------------|
| `cargo build -p im-rs-common` | Build shared library |
| `cargo build -p api-server-rs` | Build API server |
| `cargo build -p im-server-rs` | Build IM server |
| `cargo build --workspace` | Build all crates |
| `cargo test -p api-server-rs` | Run api-server Rust tests |
| `cargo fmt --check` | Rust format check |
| `cargo clippy -- -D warnings` | **Quality gate** — must pass with zero warnings |

### Backend Spring AI (run from `backend/spring-ai/`)

Requires JDK 25 + Maven. Setup:

```bash
export JAVA_HOME="$HOME/local/jdk"       # or your JDK 25 installation
export PATH="$JAVA_HOME/bin:$HOME/local/maven/bin:$PATH"
```

| Command | What it does |
|---------|-------------|
| `mvn compile` | Compile Java sources |
| `mvn package -DskipTests` | Build fat jar (`target/spring-ai-im-*.jar`) |
| `mvn test` | Run JUnit tests |
| `./mvnw compile` | Build with Maven Wrapper (no local Maven needed, Docker-compatible) |

## Rust coding rules (compile-enforced)

All three crates share these lint attributes at the top of `main.rs` / `lib.rs`. Code that violates any of these **will not compile**:

| Lint | What it forbids |
|------|----------------|
| `#![forbid(unsafe_code)]` | No `unsafe` blocks, functions, traits, unions, raw pointers, FFI |
| `#![deny(clippy::unwrap_used)]` | No `.unwrap()` — use `?`, `match`, or `.ok_or_else()` |
| `#![deny(clippy::expect_used)]` | No `.expect()` — same alternatives as unwrap |
| `#![deny(clippy::indexing_slicing)]` | No `arr[i]` — use `.get()` or iterators |
| `#![deny(clippy::panic)]` | No `panic!()`, `todo!()`, `unimplemented!()`, `unreachable!()` |
| `#![deny(clippy::todo)]` | No `todo!()` |
| `#![deny(clippy::unimplemented)]` | No `unimplemented!()` |
| `#![deny(clippy::as_conversions)]` | No `as` casts that may truncate — use `From`/`TryFrom` |
| `#![deny(unused_must_use)]` | All `Result` and `Option` must be consumed |

- All errors must be propagated with `?` or handled explicitly via `match` / `if let`.
- Integer arithmetic: prefer `checked_*`, `saturating_*`, or `wrapping_*` over bare operators.
- Must use **stable Rust** — no `#![feature(...)]`.
- If a feature seems impossible without `unsafe`, redesign using safe abstractions (e.g. `Arc<Mutex<T>>`, `OnceCell`).

### Deployment (run from repo root)

Copy `.env.example` → `.env` and edit secrets before deploying.

```bash
# 1. Start MySQL + all Redis instances + file-volume init
python scripts/deploy_middleware.py

# 2. (First time or schema change) Initialize databases
python scripts/init_db.py --full

# 3. Build and start all application services (4 services)
python scripts/deploy_services.py

# 4. Run integration test suite
python scripts/test.py
```

Deploy a single service:

```bash
python scripts/deploy_services.py api        # Rust API server
python scripts/deploy_services.py im         # Rust IM server
python scripts/deploy_services.py frontend   # Nginx frontend
python scripts/deploy_services.py ai         # Spring AI service (aliases: ai, spring-ai)
python scripts/deploy_services.py api ai --no-build  # Skip build, use cached images
```

Service name mapping:

| Alias | Compose Service | Port |
|-------|-----------------|------|
| `api` / `api-server` | `im-api-server` | 8082 |
| `im` / `im-server` | `im-server` | 8083 |
| `frontend` | `im-frontend` | 80 |
| `ai` / `spring-ai` | `im-spring-ai` | 8084 |

## Generated files (don't edit)

- `frontend/apps/web/auto-imports.d.ts` — generated by `unplugin-auto-import`
- `frontend/apps/web/components.d.ts` — generated by `unplugin-vue-components`
- `frontend/apps/web/dist/` — build output
- `backend/spring-ai/target/` — Maven build output (gitignored)
- `backend/spring-ai/mvnw` / `mvnw.cmd` / `.mvn/` — Maven Wrapper (generated, committed intentionally)

## Environment files

- Root `.env` — Docker Compose, deployment scripts, and backend runtime variables (loaded by `scripts/deploy_utils.py`)
- `frontend/.env`, `frontend/.env.development`, `frontend/.env.dev`, `frontend/.env.sit`, `frontend/.env.production` — Vite build-time env vars (only `VITE_*` prefixed vars are exposed to the browser)
- Frontend dev proxy target is controlled by `VITE_GATEWAY_HOST`/`VITE_GATEWAY_PORT` from these files

## Key quirks

- **Redis is sharded for hot data**: private-hot and group-hot each use N instances (default 1, set `IM_PRIVATE_HOT_SHARDS` / `IM_GROUP_HOT_SHARDS` in `.env` for production). All other Redis usage (cache, auth, event streams, route registry, Pub/Sub) shares a single `im-redis` instance. The deploy scripts auto-generate Redis URL lists based on the shard count.
- **SCSS auto-import**: Every `.vue` `<style lang="scss">` automatically has `@use "@/styles/variables.scss" as *;` injected via Vite config. Never add that import manually.
- **Frontend build is `es2020`**: The Vite build targets ES2020. Don't use ES2021+ syntax in frontend code.
- **Message outbox pattern**: Messages go through a durable outbox (`message_outbox` table) before delivery. The `dispatch_status` and `attempt_count` columns track retries. There's also a separate `message_state_outbox` and a `pending_status_event` backlog.
- **Docker images use Chinese mirrors**: All base images prefix with `docker.m.daocloud.io/library/`. Dockerfile npm registry is `registry.npmmirror.com`.
- **im-server needs OpenSSL at runtime**: The `im-server-rs` Dockerfile installs `libssl3` in the runtime stage. `api-server-rs` does not need this.
- **No CI/CD configs or pre-commit hooks** exist in this repo currently.
- **AI API Keys are never stored in plaintext**: Encrypted with AES-256-GCM in MySQL by Rust, decrypted in-memory only by Spring AI. Keys arrive via task payload (`im:ai:tasks` stream) and are discarded after LLM call.
- **Spring AI uses Virtual Threads**: `Thread.ofVirtual()` instead of fixed thread pools — 1000 concurrent summary requests = 1000 virtual threads.
- **Spring AI artifact naming**: Spring AI 1.1.x renamed starters. Old `spring-ai-openai-spring-boot-starter` → new `spring-ai-starter-model-openai`. Spring Data Redis 3.4 changed stream listener types to `MapRecord<String, String, String>`.
- **Maven Wrapper**: `spring-ai/` has `mvnw` (committed) for Docker builds. Don't commit `target/` — it's in `.gitignore`.

## Local dev environment (WSL2)

This repo is developed in WSL2 (Ubuntu 24.04). The following services run in Docker:

| Service | Port | Container Name | Login |
|---------|------|----------------|-------|
| MySQL 8.0 | 3306 | `im-mysql` | `root` / `root123` |
| Redis 7 | 6379 | `im-redis` | passwordless |
| Spring AI | 8084 | `im-spring-ai` | — |

### Shell setup (every new terminal session)

```bash
# Rust toolchain (installed via rustup)
source ~/.cargo/env

# Java 25 + Maven (for Spring AI)
export JAVA_HOME="$HOME/local/jdk"
export PATH="$JAVA_HOME/bin:$HOME/local/maven/bin:$PATH"

# Docker requires the `docker` group. User is already in the group,
# but the current shell may not have the group activated.
# Workaround: prefix docker commands with:
sg docker -c "docker ps"

# Or start a fresh shell with the group:
newgrp docker
```

### Rebuild & verify

```bash
cd backend
source ~/.cargo/env
cargo build -p api-server-rs        # build
cargo clippy -- -D warnings         # quality gate
cargo test -p api-server-rs         # unit tests

cd spring-ai
mvn compile                          # Java build

cd ../..
cd frontend
npm run typecheck                   # TypeScript check
npm run test                        # Vitest
```

### Docker deployment (run from repo root)

```bash
# Ensure docker wrapper is in PATH (needed for docker group permissions in WSL2)
export PATH="$HOME/bin:$PATH"

# 1. Start MySQL + all 13 Redis shards + file-volume init (skip if already running)
python3 scripts/deploy_middleware.py

# 2. (First time or schema change) Initialize databases
docker exec -i sit-im-mysql-1 mysql -uroot -proot123 --default-character-set=utf8mb4 < sql/mysql8/init_all.sql

# 3. Build and start all application services (including Spring AI)
python3 scripts/deploy_services.py --skip-middleware-check

# Or build specific services:
python3 scripts/deploy_services.py api frontend ai --skip-middleware-check

# Or build directly with docker compose:
docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d --build im-server im-api-server im-frontend im-spring-ai
```

### Run integration tests with Docker services

```bash
export PATH="$HOME/bin:$PATH"
cd backend
source ~/.cargo/env

DATABASE_URL="mysql://root:root123@127.0.0.1:3306/service_message_service_db" \
REDIS_URL="redis://127.0.0.1:6379" \
JWT_SECRET="test-jwt-32-bytes-secret-key!!" \
AUTH_REFRESH_SECRET="test-refresh-32-bytes---key!!" \
IM_INTERNAL_SECRET="test-internal-32-bytes--key!!" \
IM_GATEWAY_AUTH_SECRET="test-gateway-32-bytes--key!!" \
IM_CACHE_REDIS_URL="redis://127.0.0.1:6379" \
IM_HOT_REDIS_URL="redis://127.0.0.1:6379" \
IM_EVENT_REDIS_URL="redis://127.0.0.1:6379" \
IM_ROUTE_REDIS_URL="redis://127.0.0.1:6379" \
IM_PRIVATE_HOT_REDIS_URLS="redis://127.0.0.1:6379" \
IM_GROUP_HOT_REDIS_URLS="redis://127.0.0.1:6379" \
IM_PRIVATE_EVENT_REDIS_URL="redis://127.0.0.1:6379" \
IM_GROUP_EVENT_REDIS_URL="redis://127.0.0.1:6379" \
IM_STORAGE_LOCAL_BASE_DIR="/tmp/im-test" \
cargo test
```

### Quick verification

```bash
# Health checks
curl http://localhost:8082/health    # API server
curl http://localhost:8083/health    # IM server
curl http://localhost:8084/health    # Spring AI (add @RestController health endpoint if needed)
curl http://localhost:80/             # Frontend

# Container status
docker compose -f deploy/sit/docker-compose.yml ps
```

### Restart middleware after reboot

```bash
sg docker -c "docker start im-redis im-mysql"
# MySQL takes ~5s to be ready
sg docker -c "docker exec im-mysql mysqladmin ping -uroot -proot123 --silent"
```

### One-shot DB init (if containers are recreated)

```bash
sg docker -c "docker exec -i im-mysql mysql -uroot -proot123 --default-character-set=utf8mb4" < sql/mysql8/init_all.sql
```
