# Frontend Monorepo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `frontend/` from a single Vue 3 app into an npm workspaces monorepo with `apps/web` + 8 shared packages.

**Architecture:** npm workspaces monorepo. `apps/web/` contains the existing Vue 3 + Vite + Pinia app. `packages/*` contains 8 framework-agnostic shared packages extracted incrementally. Each phase is verified before proceeding.

**Tech Stack:** npm workspaces, TypeScript 5.x, Vue 3, Vite, Pinia, Element Plus

---

## File Structure

```text
frontend/
├── package.json                    # workspace root (@im/frontend-workspace)
├── tsconfig.base.json              # shared compiler options
├── README.md
├── apps/
│   └── web/                        # Vue 3 + Vite + Pinia + Element Plus
│       ├── package.json            # @im/web
│       ├── tsconfig.json           # extends ../../tsconfig.base.json
│       ├── tsconfig.node.json
│       ├── vite.config.ts
│       ├── src/
│       ├── public/
│       ├── index.html
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── nginx-main.conf
│       ├── .env.*
│       ├── capacitor.config.ts
│       ├── android/
│       └── ios/
└── packages/
    ├── shared-types/               # @im/shared-types
    ├── shared-api-contract/        # @im/shared-api-contract
    ├── shared-normalizers/         # @im/shared-normalizers
    ├── shared-utils/               # @im/shared-utils
    ├── shared-im-core/             # @im/shared-im-core
    ├── shared-auth-core/           # @im/shared-auth-core
    ├── shared-ws-core/             # @im/shared-ws-core
    └── shared-platform-ports/      # @im/shared-platform-ports
```

---

## Task 1: Phase 00 — Analysis (no code changes)

**Files:** (read-only analysis)
- Read: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`
- Read: `frontend/src/types/*.ts`, `frontend/src/normalizers/*.ts`, `frontend/src/services/*.ts`
- Read: `frontend/src/stores/*.ts`, `frontend/src/stores/modules/*.ts`
- Read: `frontend/src/utils/*.ts`, `frontend/src/config/index.ts`
- Read: `frontend/src/features/e2ee/*.ts` (confirm Web Crypto dependency)
- Read: `frontend/src/features/moments/*.ts` (confirm Vue component dependency)
- Create: `frontend/FRONTEND_SPLIT_ANALYSIS.md`

- [ ] **Step 1: Read and classify all source files**

Read every file listed above. For each file, classify as:
- `shared-types` candidate: pure type definitions, runtime guards
- `shared-api-contract` candidate: endpoint paths, business codes, WS message types
- `shared-normalizers` candidate: data normalization functions
- `shared-utils` candidate: pure utility functions (no platform dependency)
- `shared-im-core` candidate: IM business logic (session ID, message sort/dedup/window)
- `shared-auth-core` candidate: token decode, refresh coordination
- `shared-ws-core` candidate: WS protocol, heartbeat, reconnect strategy
- `shared-platform-ports` candidate: interface definitions
- `apps/web only`: Vue components, composables, stores, E2EE, Capacitor, localStorage

- [ ] **Step 2: Write FRONTEND_SPLIT_ANALYSIS.md**

Create `frontend/FRONTEND_SPLIT_ANALYSIS.md` with sections:
1. Current frontend structure
2. Vue-bound code (stays in apps/web)
3. Directly extractable code (goes to packages)
4. Code needing modification before extraction
5. Code that cannot be extracted
6. Recommended package boundaries
7. Candidate source files per package
8. Migration risks
9. Recommended execution order
10. Explicit do-not-touch list

- [ ] **Step 3: Verify analysis completeness**

Ensure every `*.ts` file under `frontend/src/` is accounted for in the analysis. No file should be unclassified.

---

## Task 2: Phase 01 — Path Reference Scan (no code changes)

**Files:** (read-only scan)
- Scan: entire repository for references to `frontend/` paths
- Create: `frontend/FRONTEND_PATH_REFERENCE_REPORT.md`

- [ ] **Step 1: Scan all frontend path references**

Search the repository for:
- `frontend/package.json`, `frontend/src`, `frontend/dist`
- `frontend/vite.config`, `frontend/Dockerfile`, `frontend/nginx`
- `npm run dev`, `npm run build` in scripts/docs
- Docker context paths referencing `frontend`
- `.env` files with `VITE_` or frontend-specific vars
- CI/CD configs referencing frontend paths

Use Grep to search across the entire repo.

- [ ] **Step 2: Write FRONTEND_PATH_REFERENCE_REPORT.md**

Create `frontend/FRONTEND_PATH_REFERENCE_REPORT.md` with a table:

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|--------------|-----------------|-----------|

- [ ] **Step 3: Review report for completeness**

Ensure `deploy/sit/docker-compose.yml`, `scripts/deploy_utils.py`, `scripts/deploy_services.py`, `scripts/generate_env.py` are all captured.

---

## Task 3: Phase 02 — Migrate Vue Web to apps/web

**Files:**
- Create: `frontend/apps/web/` (directory)
- Create: `frontend/package.json` (workspace root, overwrite existing)
- Create: `frontend/tsconfig.base.json`
- Create: `frontend/README.md`
- Move: all current `frontend/` files → `frontend/apps/web/`

- [ ] **Step 1: Create apps/web directory and move files**

```bash
cd D:/project/new-im-project/frontend
mkdir -p apps/web
# Move all current files except package.json, tsconfig.base.json, README.md into apps/web
# On Windows, use git mv for tracked files
```

Move these files/directories into `apps/web/`:
- `src/`, `public/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- `Dockerfile`, `nginx.conf`, `nginx-main.conf`
- `.env`, `.env.dev`, `.env.sit`, `.env.production`, `.env.example`
- `.gitignore`, `.dockerignore`
- `capacitor.config.ts`, `android/`, `ios/`
- `eslint.config.mjs`, `auto-imports.d.ts`, `components.d.ts`
- `package-lock.json`, `node_modules/` (if present)
- `dist/`, `coverage/`

Keep at root level: `FRONTEND_SPLIT_ANALYSIS.md`, `FRONTEND_PATH_REFERENCE_REPORT.md`

- [ ] **Step 2: Update apps/web/package.json name**

Edit `frontend/apps/web/package.json`: change `"name": "im-frontend"` to `"name": "@im/web"`.

- [ ] **Step 3: Create workspace root package.json**

Create `frontend/package.json`:

```json
{
  "name": "@im/frontend-workspace",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "web:dev": "npm run dev --workspace=@im/web",
    "web:dev:sit": "npm run dev:sit --workspace=@im/web",
    "web:build": "npm run build --workspace=@im/web",
    "web:build:dev": "npm run build:dev --workspace=@im/web",
    "web:build:sit": "npm run build:sit --workspace=@im/web",
    "web:typecheck": "npm run typecheck --workspace=@im/web",
    "web:test": "npm run test --workspace=@im/web",
    "web:lint": "npm run lint --workspace=@im/web",
    "web:lint:check": "npm run lint:check --workspace=@im/web",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

Create `frontend/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM"],
    "skipLibCheck": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  }
}
```

- [ ] **Step 5: Update apps/web/tsconfig.json to extend base**

Edit `frontend/apps/web/tsconfig.json` to extend the base config:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue", "auto-imports.d.ts", "components.d.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: Update apps/web/tsconfig.node.json**

Edit `frontend/apps/web/tsconfig.node.json` — keep as-is but verify relative paths still work. The `include` should reference `vite.config.ts` which is now in the same directory.

- [ ] **Step 7: Update apps/web/vite.config.ts**

The `@` alias uses `resolve(__dirname, "src")` — this still works since `vite.config.ts` moved with `src/`. Verify no changes needed.

- [ ] **Step 8: Create root README.md**

Create `frontend/README.md`:

```markdown
# Frontend Workspace

npm workspaces monorepo for the IM frontend.

## Structure

- `apps/web` — Vue 3 + Vite + Pinia + Element Plus web application
- `packages/*` — Shared framework-agnostic packages

## Commands

```bash
npm install              # Install all workspace dependencies
npm run web:dev          # Dev server
npm run web:build        # Production build
npm run web:typecheck    # Type check web app
npm run typecheck        # Type check all packages
```
```

- [ ] **Step 9: Install dependencies and verify**

```bash
cd D:/project/new-im-project/frontend
npm install
```

- [ ] **Step 10: Verify typecheck passes**

```bash
cd D:/project/new-im-project/frontend
npm run web:typecheck
```

- [ ] **Step 11: Verify build passes**

```bash
cd D:/project/new-im-project/frontend
npm run web:build
```

- [ ] **Step 12: Commit**

```bash
cd D:/project/new-im-project
git add frontend/
git commit -m "refactor: migrate Vue Web app to frontend/apps/web workspace structure"
```

---

## Task 4: Phase 03 — Fix Path References

**Files:**
- Modify: `deploy/sit/docker-compose.yml:432` — frontend build context
- Modify: `scripts/deploy_utils.py:74` — frontend_root path
- Modify: `scripts/generate_env.py:256` — frontend env file path

- [ ] **Step 1: Update docker-compose.yml frontend context**

Edit `deploy/sit/docker-compose.yml`, change the `im-frontend` build context:

```yaml
  im-frontend:
    image: im-project-sit/im-frontend:latest
    build:
      context: ../../frontend/apps/web
      args:
        FRONTEND_BUILD_MODE: "${FRONTEND_BUILD_MODE:-sit}"
        IM_BUILD_NONCE: "${IM_BUILD_NONCE:-manual}"
```

Change `context: ../../frontend` → `context: ../../frontend/apps/web`.

- [ ] **Step 2: Update deploy_utils.py frontend_root**

Edit `scripts/deploy_utils.py`, line 74:

```python
frontend_root=root / "frontend" / "apps" / "web",
```

- [ ] **Step 3: Update generate_env.py frontend path**

Edit `scripts/generate_env.py`, line 256:

```python
def render_frontend_env(profile: str) -> tuple[Path, str]:
    frontend_file = PROJECT_ROOT / "frontend" / "apps" / "web" / FRONTEND_ENV_FILES[profile]
```

- [ ] **Step 4: Verify frontend still typechecks and builds**

```bash
cd D:/project/new-im-project/frontend
npm run web:typecheck
npm run web:build
```

- [ ] **Step 5: Commit**

```bash
cd D:/project/new-im-project
git add deploy/sit/docker-compose.yml scripts/deploy_utils.py scripts/generate_env.py
git commit -m "fix: update frontend path references for apps/web migration"
```

---

## Task 5: Phase 04 — Create Packages Skeleton

**Files:**
- Create: `packages/shared-types/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-api-contract/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-normalizers/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-utils/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-im-core/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-auth-core/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-ws-core/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- Create: `packages/shared-platform-ports/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`

- [ ] **Step 1: Create shared-types package**

Create `frontend/packages/shared-types/package.json`:

```json
{
  "name": "@im/shared-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-types/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-types/src/index.ts`:

```typescript
// @im/shared-types — will be populated in Phase 06
export {};
```

Create `frontend/packages/shared-types/README.md`:

```markdown
# @im/shared-types

Framework-agnostic TypeScript type definitions and runtime type guards for the IM platform.
```

- [ ] **Step 2: Create shared-api-contract package**

Create `frontend/packages/shared-api-contract/package.json`:

```json
{
  "name": "@im/shared-api-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-api-contract/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-api-contract/src/index.ts`:

```typescript
// @im/shared-api-contract — will be populated in Phase 08
export {};
```

Create `frontend/packages/shared-api-contract/README.md`:

```markdown
# @im/shared-api-contract

API endpoint paths, WebSocket message types, and business codes for the IM platform.
```

- [ ] **Step 3: Create shared-normalizers package**

Create `frontend/packages/shared-normalizers/package.json`:

```json
{
  "name": "@im/shared-normalizers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-normalizers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-normalizers/src/index.ts`:

```typescript
// @im/shared-normalizers — will be populated in Phase 10
export {};
```

Create `frontend/packages/shared-normalizers/README.md`:

```markdown
# @im/shared-normalizers

Framework-agnostic data normalization functions for DTO → domain object mapping.
```

- [ ] **Step 4: Create shared-utils package**

Create `frontend/packages/shared-utils/package.json`:

```json
{
  "name": "@im/shared-utils",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-utils/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-utils/src/index.ts`:

```typescript
// @im/shared-utils — will be populated in Phase 12
export {};
```

Create `frontend/packages/shared-utils/README.md`:

```markdown
# @im/shared-utils

Pure utility functions (validation, masking, tracing) with no platform dependency.
```

- [ ] **Step 5: Create shared-im-core package**

Create `frontend/packages/shared-im-core/package.json`:

```json
{
  "name": "@im/shared-im-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-im-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-im-core/src/index.ts`:

```typescript
// @im/shared-im-core — will be populated in Phase 13
export {};
```

Create `frontend/packages/shared-im-core/README.md`:

```markdown
# @im/shared-im-core

IM business logic: session ID, message identity, sort, dedup, window, lifecycle.
```

- [ ] **Step 6: Create shared-auth-core package**

Create `frontend/packages/shared-auth-core/package.json`:

```json
{
  "name": "@im/shared-auth-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-auth-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-auth-core/src/index.ts`:

```typescript
// @im/shared-auth-core — will be populated in Phase 17
export {};
```

Create `frontend/packages/shared-auth-core/README.md`:

```markdown
# @im/shared-auth-core

Auth algorithms: token decode, refresh coordination, failure classification.
```

- [ ] **Step 7: Create shared-ws-core package**

Create `frontend/packages/shared-ws-core/package.json`:

```json
{
  "name": "@im/shared-ws-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-ws-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-ws-core/src/index.ts`:

```typescript
// @im/shared-ws-core — will be populated in Phase 19
export {};
```

Create `frontend/packages/shared-ws-core/README.md`:

```markdown
# @im/shared-ws-core

WebSocket protocol: path construction, heartbeat, payload parsing, reconnect strategy.
```

- [ ] **Step 8: Create shared-platform-ports package**

Create `frontend/packages/shared-platform-ports/package.json`:

```json
{
  "name": "@im/shared-platform-ports",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Create `frontend/packages/shared-platform-ports/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `frontend/packages/shared-platform-ports/src/index.ts`:

```typescript
// @im/shared-platform-ports — will be populated in Phase 21
export {};
```

Create `frontend/packages/shared-platform-ports/README.md`:

```markdown
# @im/shared-platform-ports

Interface definitions for platform services: Storage, HTTP, Logger, Notifier, Navigator.
```

- [ ] **Step 9: Install and verify**

```bash
cd D:/project/new-im-project/frontend
npm install
npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
cd D:/project/new-im-project
git add frontend/packages/
git commit -m "feat: create 8 shared package skeletons for monorepo split"
```

---

## Task 6: Phase 05 — Configure Workspace + tsconfig + Package Resolution

**Files:**
- Modify: `frontend/package.json` — verify workspaces field
- Modify: `frontend/apps/web/tsconfig.json` — add paths for `@im/*` packages
- Modify: `frontend/apps/web/vite.config.ts` — ensure workspace package resolution
- Modify: `frontend/packages/*/package.json` — verify exports field

- [ ] **Step 1: Verify workspace root package.json has workspaces**

Ensure `frontend/package.json` contains:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

This was already set in Phase 02. Verify it's correct.

- [ ] **Step 2: Add @im/* paths to apps/web tsconfig.json**

Edit `frontend/apps/web/tsconfig.json` to add package paths:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@im/shared-types": ["../../packages/shared-types/src/index.ts"],
      "@im/shared-api-contract": ["../../packages/shared-api-contract/src/index.ts"],
      "@im/shared-normalizers": ["../../packages/shared-normalizers/src/index.ts"],
      "@im/shared-utils": ["../../packages/shared-utils/src/index.ts"],
      "@im/shared-im-core": ["../../packages/shared-im-core/src/index.ts"],
      "@im/shared-auth-core": ["../../packages/shared-auth-core/src/index.ts"],
      "@im/shared-ws-core": ["../../packages/shared-ws-core/src/index.ts"],
      "@im/shared-platform-ports": ["../../packages/shared-platform-ports/src/index.ts"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue", "auto-imports.d.ts", "components.d.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Verify Vite resolves workspace packages**

npm workspaces automatically symlinks packages into `node_modules/@im/*`. Vite's default resolution handles this. Verify `frontend/apps/web/vite.config.ts` does NOT have a `resolve.alias` that would interfere with `@im/*` imports.

- [ ] **Step 4: Verify each package has correct exports field**

Ensure all 8 packages have `"exports": { ".": "./src/index.ts" }` in their `package.json`.

- [ ] **Step 5: Install and verify resolution**

```bash
cd D:/project/new-im-project/frontend
npm install
npm run typecheck
npm run web:typecheck
npm run web:build
```

- [ ] **Step 6: Commit**

```bash
cd D:/project/new-im-project
git add frontend/
git commit -m "feat: configure workspace tsconfig paths for @im/* package resolution"
```

---

## Task 7: Phase 06 — Extract shared-types

**Files:**
- Create: `packages/shared-types/src/api.ts`
- Create: `packages/shared-types/src/auth.ts`
- Create: `packages/shared-types/src/user.ts`
- Create: `packages/shared-types/src/message.ts`
- Create: `packages/shared-types/src/session.ts`
- Create: `packages/shared-types/src/friend.ts`
- Create: `packages/shared-types/src/group.ts`
- Create: `packages/shared-types/src/websocket.ts`
- Create: `packages/shared-types/src/moments.ts`
- Create: `packages/shared-types/src/utils.ts`
- Modify: `packages/shared-types/src/index.ts`

- [ ] **Step 1: Read all source types files**

Read `apps/web/src/types/api.ts`, `user.ts`, `message.ts`, `chat.ts`, `group.ts`, `common.ts`, `moments.ts`, `utils.ts` to understand the exact type definitions.

- [ ] **Step 2: Create shared-types/src/api.ts**

Extract from `apps/web/src/types/api.ts`:

```typescript
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  success: boolean;
  timestamp?: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  createdAt?: string;
  created_at?: string;
}
```

- [ ] **Step 3: Create shared-types/src/auth.ts**

Extract from `apps/web/src/types/user.ts`:

```typescript
export interface TokenParseResultDTO {
  userId: string;
  username: string;
  roles?: string[];
  exp?: number;
  iat?: number;
}

export interface TokenPairDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
}

export interface WsTicketDTO {
  ticket: string;
  expiresAt?: number;
}
```

- [ ] **Step 4: Create shared-types/src/user.ts**

Extract from `apps/web/src/types/user.ts`:

```typescript
export interface User {
  id: string;
  username: string;
  nickname?: string;
  avatar?: string;
  phone?: string;
  email?: string;
  status?: number;
  lastLoginTime?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface RawUserDTO {
  id: string | number;
  username: string;
  nickname?: string;
  avatar?: string;
  phone?: string;
  email?: string;
  status?: number;
  last_login_time?: string;
  lastLoginTime?: string;
  created_time?: string;
  createdTime?: string;
  created_at?: string;
  createdAt?: string;
  updated_time?: string;
  updatedTime?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  nickname?: string;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  remark?: string;
  status?: number;
  createdAt?: string;
  created_at?: string;
}

export interface FriendRequest {
  id: string;
  applicantId: string;
  targetUserId: string;
  status: number;
  applyTime?: string;
  applyReason?: string;
  rejectReason?: string;
  handleTime?: string;
}

export interface UserSettings {
  privacySettings?: Record<string, unknown>;
  messageSettings?: Record<string, unknown>;
  generalSettings?: Record<string, unknown>;
}

export interface UserAuthResponse {
  success: boolean;
  message: string;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
}
```

- [ ] **Step 5: Create shared-types/src/message.ts**

Extract from `apps/web/src/types/message.ts`:

```typescript
export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'VIDEO' | 'AI_REPLY' | 'SYSTEM';

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'RECALLED' | 'DELETED' | 'PENDING' | 'FAILED';

export interface Message {
  id: string;
  conversationId?: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  clientMessageId?: string;
  client_message_id?: string;
  messageType: MessageType;
  message_type?: number;
  content: string;
  mediaUrl?: string;
  media_url?: string;
  mediaSize?: number;
  media_size?: number;
  mediaName?: string;
  media_name?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  duration?: number;
  locationInfo?: string;
  location_info?: string;
  status: MessageStatus;
  isGroupChat?: boolean;
  is_group_chat?: boolean;
  replyToMessageId?: string;
  reply_to_message_id?: string;
  isAiGenerated?: boolean;
  is_ai_generated?: boolean;
  aiProvider?: string;
  ai_provider?: string;
  aiModel?: string;
  ai_model?: string;
  createdAt?: string;
  created_at?: string;
  createdTime?: string;
  created_time?: string;
  sendTime?: string;
  send_time?: string;
  updatedAt?: string;
  updated_at?: string;
  conversationSeq?: number;
  conversation_seq?: number;
}

export interface RawMessageDTO {
  id: string | number;
  conversation_id?: string;
  conversationId?: string;
  sender_id: string | number;
  senderId?: string | number;
  receiver_id?: string | number;
  receiverId?: string | number;
  group_id?: string | number;
  groupId?: string | number;
  client_message_id?: string;
  clientMessageId?: string;
  message_type?: number;
  messageType?: string;
  content: string;
  media_url?: string;
  mediaUrl?: string;
  media_size?: number;
  mediaSize?: number;
  media_name?: string;
  mediaName?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  duration?: number;
  location_info?: string;
  locationInfo?: string;
  status: number | string;
  is_group_chat?: boolean;
  isGroupChat?: boolean;
  reply_to_message_id?: string;
  replyToMessageId?: string;
  is_ai_generated?: boolean;
  isAiGenerated?: boolean;
  ai_provider?: string;
  aiProvider?: string;
  ai_model?: string;
  aiModel?: string;
  created_at?: string;
  createdAt?: string;
  created_time?: string;
  createdTime?: string;
  send_time?: string;
  sendTime?: string;
  updated_at?: string;
  updatedAt?: string;
  conversation_seq?: number;
  conversationSeq?: number;
}

export interface SendPrivateMessageRequest {
  receiverId: string;
  content: string;
  messageType?: MessageType;
  clientMessageId?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  replyToMessageId?: string;
}

export interface SendGroupMessageRequest {
  groupId: string;
  content: string;
  messageType?: MessageType;
  clientMessageId?: string;
  mediaUrl?: string;
  mediaSize?: number;
  mediaName?: string;
  thumbnailUrl?: string;
  duration?: number;
  replyToMessageId?: string;
}

export interface MessageSearchResult {
  message: Message;
  highlight?: string;
  context?: string;
}

export interface ReadReceipt {
  readerId: string;
  toUserId?: string;
  conversationId?: string;
  lastReadMessageId?: string;
  lastReadSeq?: number;
  readAt?: string;
}

export interface MessageConfig {
  types?: Record<string, unknown>;
  maxLength?: number;
  cacheSize?: number;
}
```

- [ ] **Step 6: Create shared-types/src/session.ts**

Extract from `apps/web/src/types/chat.ts`:

```typescript
export type ChatSessionType = 'PRIVATE' | 'GROUP';

export interface ChatSession {
  id: string;
  conversationId?: string;
  type: ChatSessionType;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  isPinned?: boolean;
  isMuted?: boolean;
  peerUserId?: string;
  groupId?: string;
  draftText?: string;
  draftAttachments?: unknown[];
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface RawConversationDTO {
  conversation_id: string;
  conversationId?: string;
  type?: string;
  peer_user_id?: string;
  peerUserId?: string;
  group_id?: string;
  groupId?: string;
  name?: string;
  avatar?: string;
  last_message?: string;
  lastMessage?: string;
  last_message_time?: string;
  lastMessageTime?: string;
  unread_count?: number;
  unreadCount?: number;
  is_pinned?: boolean;
  isPinned?: boolean;
  is_muted?: boolean;
  isMuted?: boolean;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export type OnlineStatus = 'online' | 'offline' | 'away' | 'busy' | 'invisible';

export interface WebSocketMessage<TData = unknown> {
  type: string;
  data?: TData;
  timestamp?: number;
  messageId?: string;
}

export interface GroupReadUser {
  userId: string;
  displayName: string;
  avatar?: string;
  readAt?: string;
}
```

- [ ] **Step 7: Create shared-types/src/group.ts**

Extract from `apps/web/src/types/group.ts`:

```typescript
export interface Group {
  id: string;
  name: string;
  avatar?: string;
  announcement?: string;
  ownerId: string;
  type?: number;
  maxMembers?: number;
  memberCount?: number;
  status?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface RawGroupDTO {
  id: string | number;
  name: string;
  avatar?: string;
  announcement?: string;
  owner_id?: string | number;
  ownerId?: string | number;
  type?: number;
  max_members?: number;
  maxMembers?: number;
  member_count?: number;
  memberCount?: number;
  status?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  nickname?: string;
  role?: number;
  status?: number;
  joinTime?: string;
}

export interface RawGroupMemberDTO {
  id: string | number;
  group_id?: string | number;
  groupId?: string | number;
  user_id?: string | number;
  userId?: string | number;
  nickname?: string;
  role?: number;
  status?: number;
  join_time?: string;
  joinTime?: string;
}

export interface CreateGroupRequest {
  name: string;
  avatar?: string;
  memberIds?: string[];
}

export interface UpdateGroupRequest {
  name?: string;
  avatar?: string;
  announcement?: string;
}
```

- [ ] **Step 8: Create shared-types/src/friend.ts**

```typescript
// Re-exports from user.ts for friend-specific types
export type { Friendship, FriendRequest } from './user.js';
```

- [ ] **Step 9: Create shared-types/src/websocket.ts**

```typescript
export type { WebSocketMessage } from './session.js';
```

- [ ] **Step 10: Create shared-types/src/moments.ts**

Extract from `apps/web/src/types/moments.ts`:

```typescript
export interface MomentPost {
  id: string;
  userId: string;
  content?: string;
  media?: MomentMedia[];
  likeCount?: number;
  commentCount?: number;
  isLiked?: boolean;
  createdAt?: string;
  created_at?: string;
}

export interface MomentMedia {
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MomentLike {
  userId: string;
  postId: string;
  createdAt?: string;
}

export interface MomentComment {
  id: string;
  userId: string;
  postId: string;
  content: string;
  replyToCommentId?: string;
  createdAt?: string;
}

export interface MomentNotification {
  id: string;
  type: 'like' | 'comment';
  actorId: string;
  postId: string;
  createdAt?: string;
}

export interface PostWithDetails extends MomentPost {
  authorName?: string;
  authorAvatar?: string;
}

export interface CreatePostRequest {
  content?: string;
  media?: MomentMedia[];
}

export interface CreateCommentRequest {
  postId: string;
  content: string;
  replyToCommentId?: string;
}

export interface FeedQuery {
  cursor?: string;
  limit?: number;
}
```

- [ ] **Step 11: Create shared-types/src/utils.ts**

Extract from `apps/web/src/types/utils.ts`:

```typescript
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// Type utility types
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };
```

- [ ] **Step 12: Create shared-types/src/index.ts**

```typescript
export * from './api.js';
export * from './auth.js';
export * from './user.js';
export * from './message.js';
export * from './session.js';
export * from './friend.js';
export * from './group.js';
export * from './websocket.js';
export * from './moments.js';
export * from './utils.js';
```

- [ ] **Step 13: Verify typecheck**

```bash
cd D:/project/new-im-project/frontend
npm run typecheck
```

- [ ] **Step 14: Commit**

```bash
cd D:/project/new-im-project
git add frontend/packages/shared-types/
git commit -m "feat: extract shared-types package with all type definitions"
```

---

## Task 8: Phase 07 — Let apps/web Use shared-types

**Files:**
- Modify: `apps/web/src/types/index.ts` — add re-exports from `@im/shared-types`
- Modify: `apps/web/src/types/api.ts` — re-export from shared-types
- Modify: `apps/web/src/types/user.ts` — re-export from shared-types
- Modify: `apps/web/src/types/message.ts` — re-export from shared-types
- Modify: `apps/web/src/types/chat.ts` — re-export from shared-types
- Modify: `apps/web/src/types/group.ts` — re-export from shared-types
- Modify: `apps/web/src/types/moments.ts` — re-export from shared-types
- Modify: `apps/web/src/types/utils.ts` — re-export from shared-types

- [ ] **Step 1: Update apps/web/src/types/api.ts**

Replace the type definitions with re-exports:

```typescript
export type {
  ApiResponse,
  PageRequest,
  PageResponse,
  FileUploadResponse,
} from '@im/shared-types';
```

- [ ] **Step 2: Update apps/web/src/types/user.ts**

```typescript
export type {
  User,
  RawUserDTO,
  LoginRequest,
  RegisterRequest,
  Friendship,
  FriendRequest,
  UserSettings,
  UserAuthResponse,
  TokenParseResultDTO,
  TokenPairDTO,
  WsTicketDTO,
} from '@im/shared-types';
```

- [ ] **Step 3: Update apps/web/src/types/message.ts**

```typescript
export type {
  MessageType,
  MessageStatus,
  Message,
  RawMessageDTO,
  SendPrivateMessageRequest,
  SendGroupMessageRequest,
  MessageSearchResult,
  ReadReceipt,
  MessageConfig,
} from '@im/shared-types';
```

- [ ] **Step 4: Update apps/web/src/types/chat.ts**

```typescript
export type {
  ChatSessionType,
  ChatSession,
  RawConversationDTO,
  OnlineStatus,
  WebSocketMessage,
  GroupReadUser,
} from '@im/shared-types';
```

- [ ] **Step 5: Update apps/web/src/types/group.ts**

```typescript
export type {
  Group,
  RawGroupDTO,
  GroupMember,
  RawGroupMemberDTO,
  CreateGroupRequest,
  UpdateGroupRequest,
} from '@im/shared-types';
```

- [ ] **Step 6: Update apps/web/src/types/moments.ts**

```typescript
export type {
  MomentPost,
  MomentMedia,
  MomentLike,
  MomentComment,
  MomentNotification,
  PostWithDetails,
  CreatePostRequest,
  CreateCommentRequest,
  FeedQuery,
} from '@im/shared-types';
```

- [ ] **Step 7: Update apps/web/src/types/utils.ts**

```typescript
export {
  isRecord,
  asString,
  asNumber,
  asBoolean,
  type PartialBy,
  type RequiredBy,
  type DeepPartial,
} from '@im/shared-types';
```

- [ ] **Step 8: Verify typecheck and build**

```bash
cd D:/project/new-im-project/frontend
npm run web:typecheck
npm run web:build
```

- [ ] **Step 9: Commit**

```bash
cd D:/project/new-im-project
git add frontend/apps/web/src/types/
git commit -m "refactor: apps/web types now re-export from @im/shared-types"
```

---

## Task 9: Phase 08 — Extract shared-api-contract

**Files:**
- Create: `packages/shared-api-contract/src/auth.endpoints.ts`
- Create: `packages/shared-api-contract/src/user.endpoints.ts`
- Create: `packages/shared-api-contract/src/message.endpoints.ts`
- Create: `packages/shared-api-contract/src/friend.endpoints.ts`
- Create: `packages/shared-api-contract/src/group.endpoints.ts`
- Create: `packages/shared-api-contract/src/ai.endpoints.ts`
- Create: `packages/shared-api-contract/src/file.endpoints.ts`
- Create: `packages/shared-api-contract/src/websocket.endpoints.ts`
- Create: `packages/shared-api-contract/src/codes.ts`
- Modify: `packages/shared-api-contract/src/index.ts`

- [ ] **Step 1: Read service files for endpoint paths**

Read `apps/web/src/services/auth.ts`, `user.ts`, `message.ts`, `friend.ts`, `group.ts`, `ai.ts`, `file.ts` and `apps/web/src/stores/websocket.ts` for WS message types.

- [ ] **Step 2: Create auth.endpoints.ts**

```typescript
export const AUTH_ENDPOINTS = {
  PARSE: '/auth/parse',
  REFRESH: '/auth/refresh',
  WS_TICKET: '/auth/ws-ticket',
} as const;
```

- [ ] **Step 3: Create user.endpoints.ts**

```typescript
export const USER_ENDPOINTS = {
  LOGIN: '/user/login',
  REGISTER: '/user/register',
  PROFILE: '/user/profile',
  SEARCH: '/user/search',
  LOGOUT: '/user/logout',
  HEARTBEAT: '/user/heartbeat',
  ONLINE_STATUS: '/user/online-status',
  CHANGE_PASSWORD: '/user/change-password',
  SEND_PHONE_CODE: '/user/send-phone-code',
  BIND_PHONE: '/user/bind-phone',
  SEND_EMAIL_CODE: '/user/send-email-code',
  BIND_EMAIL: '/user/bind-email',
  DELETE_ACCOUNT: '/user/delete-account',
  SETTINGS: '/user/settings',
} as const;
```

- [ ] **Step 4: Create message.endpoints.ts**

```typescript
export const MESSAGE_ENDPOINTS = {
  SEND_PRIVATE: '/message/send/private',
  SEND_GROUP: '/message/send/group',
  PRIVATE_HISTORY: '/message/private/history',
  PRIVATE_HISTORY_CURSOR: '/message/private/history/cursor',
  GROUP_HISTORY: '/message/group/history',
  GROUP_HISTORY_CURSOR: '/message/group/history/cursor',
  CONVERSATIONS: '/message/conversations',
  MARK_READ: '/message/mark-read',
  RECALL: '/message/recall',
  DELETE: '/message/delete',
  CONFIG: '/message/config',
} as const;
```

- [ ] **Step 5: Create friend.endpoints.ts**

```typescript
export const FRIEND_ENDPOINTS = {
  LIST: '/friend/list',
  ADD: '/friend/add',
  REQUESTS: '/friend/requests',
  HANDLE_REQUEST: '/friend/handle-request',
  DELETE: '/friend/delete',
  UPDATE_REMARK: '/friend/update-remark',
} as const;
```

- [ ] **Step 6: Create group.endpoints.ts**

```typescript
export const GROUP_ENDPOINTS = {
  CREATE: '/group/create',
  LIST: '/group/list',
  MEMBERS: '/group/members',
  JOIN: '/group/join',
  ADD_MEMBERS: '/group/add-members',
  SEARCH: '/group/search',
  QUIT: '/group/quit',
  DISMISS: '/group/dismiss',
  UPDATE: '/group/update',
} as const;
```

- [ ] **Step 7: Create ai.endpoints.ts**

```typescript
export const AI_ENDPOINTS = {
  KEYS: '/ai/keys',
  KEY_TEST: '/ai/keys/test',
  SETTINGS: '/ai/settings',
} as const;
```

- [ ] **Step 8: Create file.endpoints.ts**

```typescript
export const FILE_ENDPOINTS = {
  UPLOAD: '/file/upload',
  UPLOAD_IMAGE: '/file/upload/image',
  UPLOAD_VIDEO: '/file/upload/video',
  UPLOAD_AUDIO: '/file/upload/audio',
  DELETE: '/file/delete',
} as const;
```

- [ ] **Step 9: Create websocket.endpoints.ts**

```typescript
export const WS_ENDPOINTS = {
  PATH: '/websocket',
  TICKET_PARAM: 'ticket',
} as const;
```

- [ ] **Step 10: Create codes.ts**

```typescript
export const WS_MESSAGE_TYPES = {
  MESSAGE: 'MESSAGE',
  MESSAGE_STATUS_CHANGED: 'MESSAGE_STATUS_CHANGED',
  HEARTBEAT: 'HEARTBEAT',
  ONLINE_STATUS: 'ONLINE_STATUS',
  READ_RECEIPT: 'READ_RECEIPT',
  READ_SYNC: 'READ_SYNC',
  SYSTEM: 'SYSTEM',
  FRIEND_REQUEST: 'FRIEND_REQUEST',
  FRIEND_ACCEPTED: 'FRIEND_ACCEPTED',
  E2EE_NEGOTIATION: 'E2EE_NEGOTIATION',
} as const;

export const API_CODES = {
  SUCCESS: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
```

- [ ] **Step 11: Create index.ts**

```typescript
export * from './auth.endpoints.js';
export * from './user.endpoints.js';
export * from './message.endpoints.js';
export * from './friend.endpoints.js';
export * from './group.endpoints.js';
export * from './ai.endpoints.js';
export * from './file.endpoints.js';
export * from './websocket.endpoints.js';
export * from './codes.js';
```

- [ ] **Step 12: Verify**

```bash
cd D:/project/new-im-project/frontend
npm run typecheck
```

- [ ] **Step 13: Commit**

```bash
cd D:/project/new-im-project
git add frontend/packages/shared-api-contract/
git commit -m "feat: extract shared-api-contract with endpoint paths and WS message types"
```

---

## Task 10: Phase 09 — Let apps/web Use shared-api-contract

**Files:**
- Modify: `apps/web/src/services/auth.ts` — use `AUTH_ENDPOINTS`
- Modify: `apps/web/src/services/user.ts` — use `USER_ENDPOINTS`
- Modify: `apps/web/src/services/message.ts` — use `MESSAGE_ENDPOINTS`
- Modify: `apps/web/src/services/friend.ts` — use `FRIEND_ENDPOINTS`
- Modify: `apps/web/src/services/group.ts` — use `GROUP_ENDPOINTS`
- Modify: `apps/web/src/services/ai.ts` — use `AI_ENDPOINTS`
- Modify: `apps/web/src/services/file.ts` — use `FILE_ENDPOINTS`
- Modify: `apps/web/src/stores/websocket.ts` — use `WS_MESSAGE_TYPES`

- [ ] **Step 1: Update auth.ts service**

Replace hardcoded endpoint paths with `AUTH_ENDPOINTS` imports.

- [ ] **Step 2: Update user.ts service**

Replace hardcoded endpoint paths with `USER_ENDPOINTS` imports.

- [ ] **Step 3: Update message.ts service**

Replace hardcoded endpoint paths with `MESSAGE_ENDPOINTS` imports.

- [ ] **Step 4: Update friend.ts service**

Replace hardcoded endpoint paths with `FRIEND_ENDPOINTS` imports.

- [ ] **Step 5: Update group.ts service**

Replace hardcoded endpoint paths with `GROUP_ENDPOINTS` imports.

- [ ] **Step 6: Update ai.ts service**

Replace hardcoded endpoint paths with `AI_ENDPOINTS` imports.

- [ ] **Step 7: Update file.ts service**

Replace hardcoded endpoint paths with `FILE_ENDPOINTS` imports.

- [ ] **Step 8: Update websocket.ts store**

Replace `WS_MESSAGE_TYPES` constants with imports from `@im/shared-api-contract`.

- [ ] **Step 9: Verify**

```bash
cd D:/project/new-im-project/frontend
npm run web:typecheck
npm run web:build
```

- [ ] **Step 10: Commit**

```bash
cd D:/project/new-im-project
git add frontend/apps/web/src/services/ frontend/apps/web/src/stores/websocket.ts
git commit -m "refactor: apps/web services use @im/shared-api-contract endpoints"
```

---

## Task 11: Phase 10 — Extract shared-normalizers

**Files:**
- Create: `packages/shared-normalizers/src/message.ts`
- Create: `packages/shared-normalizers/src/user.ts`
- Create: `packages/shared-normalizers/src/chat.ts`
- Create: `packages/shared-normalizers/src/group.ts`
- Create: `packages/shared-normalizers/src/friendRequest.ts`
- Create: `packages/shared-normalizers/src/moments.ts`
- Modify: `packages/shared-normalizers/src/index.ts`
- Modify: `packages/shared-normalizers/package.json` — add `@im/shared-types` dependency

- [ ] **Step 1: Add shared-types dependency**

Edit `packages/shared-normalizers/package.json`:

```json
{
  "name": "@im/shared-normalizers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@im/shared-types": "*"
  }
}
```

- [ ] **Step 2: Read source normalizers**

Read `apps/web/src/normalizers/message.ts`, `chat.ts`, `user.ts`, `group.ts`, `friendRequest.ts`, `moments.ts`.

- [ ] **Step 3: Create message normalizer**

Create `packages/shared-normalizers/src/message.ts` with functions from `apps/web/src/normalizers/message.ts`: `normalizeMessage`, `normalizeMessageConfig`, `normalizeReadReceipt`, `normalizeMessageType`, `normalizeMessageStatus`, `normalizeMessageSendTime`, `splitTextByCodePoints`.

- [ ] **Step 4: Create user normalizer**

Create `packages/shared-normalizers/src/user.ts` with: `normalizeUser`, `normalizeFriendship`, `normalizeFriendRequest`, `normalizeUserAuthResponse`, `normalizeUserSettings`, `defaultUserSettings`.

- [ ] **Step 5: Create chat normalizer**

Create `packages/shared-normalizers/src/chat.ts` with: `toBigIntId`, `compareIds`, `buildSessionId`, `safePreferExistingId`, `normalizeConversation`.

- [ ] **Step 6: Create group normalizer**

Create `packages/shared-normalizers/src/group.ts` with: `normalizeGroup`, `normalizeGroupMember`.

- [ ] **Step 7: Create friendRequest normalizer**

Create `packages/shared-normalizers/src/friendRequest.ts` with: `extractFriendRequestList`.

- [ ] **Step 8: Create moments normalizer**

Create `packages/shared-normalizers/src/moments.ts` with any moment normalizers.

- [ ] **Step 9: Update index.ts**

```typescript
export * from './message.js';
export * from './user.js';
export * from './chat.js';
export * from './group.js';
export * from './friendRequest.js';
export * from './moments.js';
```

- [ ] **Step 10: Verify**

```bash
cd D:/project/new-im-project/frontend
npm run typecheck
```

- [ ] **Step 11: Commit**

```bash
cd D:/project/new-im-project
git add frontend/packages/shared-normalizers/
git commit -m "feat: extract shared-normalizers with data normalization functions"
```

---

## Task 12: Phase 11 — Let apps/web Use shared-normalizers

**Files:**
- Modify: `apps/web/src/normalizers/*.ts` — re-export from `@im/shared-normalizers`
- Modify: services and stores that import normalizers

- [ ] **Step 1: Update apps/web/src/normalizers/ to re-export**

Replace each normalizer file with re-exports from `@im/shared-normalizers`.

- [ ] **Step 2: Verify**

```bash
cd D:/project/new-im-project/frontend
npm run web:typecheck
npm run web:build
```

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add frontend/apps/web/src/normalizers/
git commit -m "refactor: apps/web normalizers re-export from @im/shared-normalizers"
```

---

## Task 13: Phase 12 — Extract shared-utils

**Files:**
- Create: `packages/shared-utils/src/validation.ts`
- Create: `packages/shared-utils/src/mask.ts`
- Create: `packages/shared-utils/src/trace.ts`
- Modify: `packages/shared-utils/src/index.ts`

- [ ] **Step 1: Create validation.ts**

Extract from `apps/web/src/utils/auth.ts`:

```typescript
export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePhone(phone: string): boolean {
  const re = /^1[3-9]\d{9}$/;
  return re.test(phone);
}

export function validateUsername(username: string): { valid: boolean; message?: string } {
  if (username.length < 3 || username.length > 20) {
    return { valid: false, message: '用户名长度3-20个字符' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' };
  }
  return { valid: true };
}

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < 8 || password.length > 64) {
    return { valid: false, message: '密码长度8-64个字符' };
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, message: '密码必须包含字母和数字' };
  }
  return { valid: true };
}
```

- [ ] **Step 2: Create mask.ts**

```typescript
export function maskSensitiveInfo(value: string, type: 'email' | 'phone' | 'idCard'): string {
  if (!value) return value;
  switch (type) {
    case 'email': {
      const [local, domain] = value.split('@');
      if (!domain) return value;
      return local.length <= 2
        ? `${local[0]}***@${domain}`
        : `${local[0]}***${local[local.length - 1]}@${domain}`;
    }
    case 'phone':
      return value.length >= 7
        ? `${value.slice(0, 3)}****${value.slice(-4)}`
        : value;
    case 'idCard':
      return value.length >= 8
        ? `${value.slice(0, 4)}**********${value.slice(-4)}`
        : value;
    default:
      return value;
  }
}
```

- [ ] **Step 3: Create trace.ts**

```typescript
let counter = 0;

export function createTraceId(): string {
  counter = (counter + 1) & 0xffff;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const seq = counter.toString(36).padStart(4, '0');
  return `${ts}-${rand}-${seq}`;
}
```

- [ ] **Step 4: Update index.ts**

```typescript
export * from './validation.js';
export * from './mask.js';
export * from './trace.js';
```

- [ ] **Step 5: Verify**

```bash
cd D:/project/new-im-project/frontend
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd D:/project/new-im-project
git add frontend/packages/shared-utils/
git commit -m "feat: extract shared-utils with validation, masking, and trace functions"
```

---

## Tasks 14-28: Phase 13-27 (Deferred)

The remaining phases follow the same pattern:

- **Phase 13-16**: Extract shared-im-core (session ID, message identity, sort, dedup, window, pending/message lifecycle)
- **Phase 17-18**: Extract shared-auth-core (token decode, refresh coordinator, classify)
- **Phase 19-20**: Extract shared-ws-core (path, heartbeat, payload, strategy)
- **Phase 21**: Extract shared-platform-ports (interface definitions)
- **Phase 22-24**: Add vitest tests for shared packages
- **Phase 25**: Clean up duplicate code in apps/web
- **Phase 26**: Update documentation
- **Phase 27**: Final verification

These will be detailed in subsequent plan updates after Phase 00-12 are complete.

---

## Self-Review Checklist

- [ ] Every phase in the spec has a corresponding task
- [ ] No placeholder steps ("TBD", "TODO", "implement later")
- [ ] All file paths are exact
- [ ] Code blocks contain complete content
- [ ] Verification commands are included after each phase
- [ ] Commits are included after each phase
- [ ] Dependency direction: packages → packages, apps → packages, never packages → apps
- [ ] @ alias preserved in apps/web
- [ ] No Vue/pinia/element-plus in packages
