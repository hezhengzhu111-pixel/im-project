# Frontend Path Reference Scan Report

**Scan date:** 2026-05-11
**Scope:** All references to `frontend/` paths, `im-frontend` service name, `FRONTEND_*` env vars, `VITE_*` env vars, `npm run` commands targeting frontend, and Docker context paths referencing `frontend`.
**Purpose:** Identify all paths that must change when `frontend/` becomes a workspace root with `frontend/apps/web/` containing the Vue app.

---

## Summary

| Category | Count | Must Fix Now | Can Defer |
|----------|-------|-------------|-----------|
| Docker/Deployment (build context, compose) | 3 | 3 | 0 |
| Python deployment scripts | 5 | 5 | 0 |
| Root config files (.gitignore, .env.example) | 5 | 3 | 2 |
| Documentation (CLAUDE.md, AGENTS.md, README.md) | 18 | 2 | 16 |
| Frontend internal config (Dockerfile, nginx, vite, tsconfig, env files) | 12 | 5 | 7 |
| Frontend package metadata | 3 | 1 | 2 |
| Docs/plans (historical, not executed) | 40+ | 0 | 40+ |
| **Total actionable** | **46** | **19** | **27** |

---

## Detailed Reference Table

### Category 1: Docker / Deployment (CRITICAL)

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `deploy/sit/docker-compose.yml` | 432 | `context: ../../frontend` | `context: ../../frontend/apps/web` | YES | NO | NO |
| `deploy/sit/docker-compose.yml` | 434 | `FRONTEND_BUILD_MODE: "${FRONTEND_BUILD_MODE:-sit}"` | (no change needed) | NO | NO | YES |
| `deploy/sit/docker-compose.yml` | 443 | `"${FRONTEND_PORT:-80}:80"` | (no change needed) | NO | NO | YES |
| `frontend/Dockerfile` | 2 | `WORKDIR /app` + `COPY package*.json ./` | (no change — runs inside build context) | NO | NO | NO |
| `frontend/Dockerfile` | 26 | `COPY --from=builder /app/dist /usr/share/nginx/html` | (no change — internal to container) | NO | NO | NO |
| `frontend/Dockerfile` | 27 | `COPY nginx-main.conf /etc/nginx/nginx.conf` | (no change — files copied from build context) | NO | NO | NO |
| `frontend/Dockerfile` | 28 | `COPY nginx.conf /etc/nginx/conf.d/default.conf` | (no change — files copied from build context) | NO | NO | NO |

**Note:** The Dockerfile internal paths (`COPY nginx.conf`, `COPY nginx-main.conf`) are relative to the Docker build context. If the build context changes from `frontend/` to `frontend/apps/web/`, then `nginx.conf` and `nginx-main.conf` must exist at `frontend/apps/web/` level (or Dockerfile paths adjusted). This is a **cascading fix** — the Dockerfile itself doesn't reference `frontend/` but depends on files being at the context root.

### Category 2: Python Deployment Scripts (CRITICAL)

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `scripts/deploy_utils.py` | 74 | `frontend_root=root / "frontend"` | `frontend_root=root / "frontend" / "apps" / "web"` | YES | NO | NO |
| `scripts/deploy_utils.py` | 89 | `config.frontend_root / "package.json"` | (no change — uses frontend_root variable) | NO | NO | NO |
| `scripts/deploy_utils.py` | 90 | `config.frontend_root / "Dockerfile"` | (no change — uses frontend_root variable) | NO | NO | NO |
| `scripts/deploy_utils.py` | 91 | `config.frontend_root / "nginx.conf"` | (no change — uses frontend_root variable) | NO | NO | NO |
| `scripts/generate_env.py` | 256 | `PROJECT_ROOT / "frontend" / FRONTEND_ENV_FILES[profile]` | `PROJECT_ROOT / "frontend" / "apps" / "web" / FRONTEND_ENV_FILES[profile]` | YES | NO | NO |
| `scripts/deploy_services.py` | 26 | `"frontend": "im-frontend"` | (no change — Docker Compose service name) | NO | NO | NO |
| `scripts/deploy_services.py` | 31 | `"im-frontend"` in APP_SERVICES | (no change — Docker Compose service name) | NO | NO | NO |
| `scripts/init_db.py` | 24 | `"im-frontend"` in APPLICATION_SERVICES | (no change — Docker Compose service name) | NO | NO | NO |
| `scripts/test.py` | (none) | No frontend path references | N/A | NO | NO | NO |

### Category 3: Root Config Files

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `.gitignore` | 18 | `frontend/node_modules/` | `frontend/**/node_modules/` or `frontend/node_modules/` + `frontend/apps/web/node_modules/` | YES | NO | NO |
| `.gitignore` | 19 | `frontend/dist/` | `frontend/**/dist/` or `frontend/apps/web/dist/` | YES | NO | NO |
| `.gitignore` | 20 | `frontend/coverage/` | `frontend/**/coverage/` or `frontend/apps/web/coverage/` | YES | NO | NO |
| `.env.example` | 21 | `FRONTEND_PORT=80` | (no change needed) | NO | NO | YES |
| `.env.example` | 40 | `FRONTEND_BUILD_MODE=sit` | (no change needed) | NO | NO | YES |

### Category 4: Documentation (CLAUDE.md, AGENTS.md, README.md)

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `CLAUDE.md` | 21 | `frontend/` in directory structure | `frontend/apps/web/` | YES (user reads this) | NO | NO |
| `CLAUDE.md` | 36 | `### Frontend (run from `frontend/`)` | `### Frontend (run from `frontend/apps/web/`)` | YES | NO | NO |
| `CLAUDE.md` | 39-45 | `npm run dev`, `npm run build`, etc. | `npm run web:dev`, `npm run web:build`, etc. (or keep as-is if workspace scripts added) | YES | NO | NO |
| `CLAUDE.md` | 207 | `frontend/nginx.conf` | `frontend/apps/web/nginx.conf` | YES | NO | NO |
| `CLAUDE.md` | 553 | `frontend/nginx-main.conf` | `frontend/apps/web/nginx-main.conf` | YES | NO | NO |
| `CLAUDE.md` | 599 | `frontend/src/test/` | `frontend/apps/web/src/test/` | YES | NO | NO |
| `CLAUDE.md` | 638 | `frontend/src/test/` | `frontend/apps/web/src/test/` | YES | NO | NO |
| `CLAUDE.md` | 649 | `frontend/.env.*` | `frontend/apps/web/.env.*` | YES | NO | NO |
| `CLAUDE.md` | 673 | `frontend/auto-imports.d.ts` | `frontend/apps/web/auto-imports.d.ts` | YES | NO | NO |
| `CLAUDE.md` | 674 | `frontend/components.d.ts` | `frontend/apps/web/components.d.ts` | YES | NO | NO |
| `CLAUDE.md` | 675 | `frontend/dist/` | `frontend/apps/web/dist/` | YES | NO | NO |
| `CLAUDE.md` | 538 | `frontend→im-frontend` service alias | (no change) | NO | NO | YES |
| `AGENTS.md` | 16 | `frontend/` in architecture | `frontend/apps/web/` | YES | NO | NO |
| `AGENTS.md` | 54 | `### Frontend (run from `frontend/`)` | `### Frontend (run from `frontend/apps/web/`)` | YES | NO | NO |
| `AGENTS.md` | 66 | `frontend/src/test/` | `frontend/apps/web/src/test/` | YES | NO | NO |
| `AGENTS.md` | 156-158 | `frontend/auto-imports.d.ts`, `frontend/components.d.ts`, `frontend/dist/` | `frontend/apps/web/...` | YES | NO | NO |
| `AGENTS.md` | 165 | `frontend/.env`, `frontend/.env.development`, etc. | `frontend/apps/web/.env`, etc. | YES | NO | NO |
| `frontend/README.md` | 1-32 | Internal references (npm install, npm run dev, etc.) | (no change if run from apps/web) | NO | NO | YES |

### Category 5: Frontend Internal Config Files

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `frontend/Dockerfile` | 19 | `ARG FRONTEND_BUILD_MODE=sit` | (no change) | NO | NO | NO |
| `frontend/Dockerfile` | 20-22 | `npm run build:dev`, `npm run build:sit`, `npm run build` | (no change — relative to build context) | NO | NO | NO |
| `frontend/nginx.conf` | 1-86 | All paths are container-internal | (no change) | NO | NO | NO |
| `frontend/nginx-main.conf` | 1-47 | All paths are container-internal | (no change) | NO | NO | NO |
| `frontend/vite.config.ts` | 10 | `loadEnv(mode, process.cwd(), "")` | (no change — uses cwd) | NO | NO | NO |
| `frontend/vite.config.ts` | 33 | `resolve(__dirname, "src")` | (no change — relative to vite.config.ts) | NO | NO | NO |
| `frontend/tsconfig.json` | 18 | `"@/*": ["src/*"]` | (no change — relative to tsconfig location) | NO | NO | NO |
| `frontend/tsconfig.json` | 21 | `"include": ["src/**/*.ts", ...]` | (no change — relative) | NO | NO | NO |
| `frontend/tsconfig.node.json` | 8 | `"include": ["vite.config.ts"]` | (no change — relative) | NO | NO | NO |
| `frontend/.env.dev` | 1-25 | VITE_ vars | (no change — file moves with app) | NO | NO | NO |
| `frontend/.env.sit` | 1-19 | VITE_ vars | (no change — file moves with app) | NO | NO | NO |
| `frontend/.env.production` | 1-24 | VITE_ vars | (no change — file moves with app) | NO | NO | NO |
| `frontend/.env.development` | 1-21 | VITE_ vars | (no change — file moves with app) | NO | NO | NO |
| `frontend/src/vite-env.d.ts` | 3-6 | `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_APP_TITLE` | (no change — Vite types) | NO | NO | NO |
| `frontend/src/config/index.ts` | 10 | `import.meta.env.VITE_API_BASE_URL` | (no change — Vite runtime) | NO | NO | NO |
| `frontend/src/config/index.ts` | 30 | `import.meta.env.VITE_WS_BASE_URL` | (no change — Vite runtime) | NO | NO | NO |
| `frontend/src/config/websocket.ts` | 28 | `import.meta.env.VITE_WS_BASE_URL` | (no change — Vite runtime) | NO | NO | NO |
| `frontend/eslint.config.mjs` | (exists) | Internal config | (no change — relative) | NO | NO | NO |

### Category 6: Frontend Package Metadata

| File | Line | Current Reference | Post-Split Reference | Must Fix Now | Affects Backend | Can Defer |
|------|------|-------------------|---------------------|-------------|----------------|-----------|
| `frontend/package.json` | 2 | `"name": "im-frontend"` | `"name": "@im/web"` (if workspace rename desired) | YES (for workspace) | NO | NO |
| `frontend/package-lock.json` | 2,8 | `"name": "im-frontend"` | (auto-regenerated on npm install) | NO | NO | YES |
| `frontend/package.json` | 7-23 | `npm run dev`, `npm run build`, etc. | (no change — scripts stay in apps/web) | NO | NO | NO |

### Category 7: Historical Docs/Plans (CAN DEFER / SKIP)

These files are historical plan/spec documents. They contain `frontend/` references but are not executed code. They can be updated later or left as-is since they document the state at time of writing.

| File | Approximate Count | Notes |
|------|------------------|-------|
| `docs/superpowers/plans/2026-05-02-moments.md` | 10 | `cd frontend && npm run typecheck` |
| `docs/superpowers/plans/2026-05-03-mobile-improvements.md` | 3 | `cd D:/project/new-im-project/frontend && npm run ...` |
| `docs/superpowers/plans/2026-05-03-cloud-deployment.md` | 5 | FRONTEND_PORT, FRONTEND_BUILD_MODE refs |
| `docs/superpowers/plans/2026-05-04-e2ee.md` | 12 | `cd frontend && npx vitest run ...` |
| `docs/superpowers/plans/2026-05-11-frontend-monorepo-split.md` | 30+ | (this IS the split plan — already accounts for changes) |
| `docs/superpowers/specs/2026-05-03-cloud-deployment-design.md` | 3 | FRONTEND_BUILD_MODE, im-frontend healthcheck |
| `docs/superpowers/specs/2026-05-11-frontend-monorepo-split-design.md` | 5 | (this IS the split spec) |
| `docs/deployment/cloud-deployment.md` | 1 | `im-frontend` service name |
| `AGENTS.md` | 2 | `cd frontend` in workflow section (line 224) |

---

## Fix Priority Matrix

### P0 — Must fix for Docker build to work (3 items)

1. **`deploy/sit/docker-compose.yml:432`** — `context: ../../frontend` must become `context: ../../frontend/apps/web`
2. **`scripts/deploy_utils.py:74`** — `frontend_root=root / "frontend"` must become `root / "frontend" / "apps" / "web"`
3. **`scripts/generate_env.py:256`** — `PROJECT_ROOT / "frontend"` must become `PROJECT_ROOT / "frontend" / "apps" / "web"`

### P1 — Must fix for correct .gitignore and project layout checks (5 items)

4. **`.gitignore:18-20`** — `frontend/node_modules/`, `frontend/dist/`, `frontend/coverage/` need glob or explicit update
5. **`scripts/deploy_utils.py:89-91`** — These use `config.frontend_root` so they auto-fix after #2, but verify after change

### P2 — Must fix for developer experience (13 items)

6-18. **`CLAUDE.md`** — 13 references to `frontend/` paths in docs sections (lines 21, 36, 39-45, 207, 553, 599, 638, 649, 673-675)
19-24. **`AGENTS.md`** — 6 references (lines 16, 54, 66, 156-158, 165)

### P3 — Nice to have (workspace config)

25. **`frontend/package.json:2`** — `"name": "im-frontend"` rename to `"@im/web"` for workspace convention

### P4 — Can defer indefinitely

- All `docs/superpowers/` plan/spec files (historical)
- `frontend/README.md` (internal, moves with the code)
- `frontend/package-lock.json` (auto-regenerated)
- `.env.example` FRONTEND_PORT/FRONTEND_BUILD_MODE (not path-dependent)

---

## Cascading Effects

When `deploy/sit/docker-compose.yml` build context changes from `../../frontend` to `../../frontend/apps/web`:

1. **Dockerfile COPY paths** — `COPY nginx-main.conf`, `COPY nginx.conf`, `COPY package*.json` all expect files at context root. These files must exist at `frontend/apps/web/` level.
2. **Vite `outDir: "dist"`** — Output goes to `frontend/apps/web/dist/`. Dockerfile `COPY --from=builder /app/dist` still works (relative to WORKDIR).
3. **`npm ci` / `npm run build`** — These run inside the container at `/app`. No change needed as long as `package.json` is at context root.

When `scripts/deploy_utils.py` frontend_root changes:

1. **`ensure_project_layout()`** checks for `package.json`, `Dockerfile`, `nginx.conf` at `frontend_root`. All three must exist at `frontend/apps/web/`.
2. **`generate_env.py`** writes `.env.*` files to `frontend_root`. The `.env.dev`, `.env.sit`, `.env.production` files must be at `frontend/apps/web/`.

---

## Files NOT Requiring Changes

These files contain `frontend` references that are **not path references** and need no update:

| File | Reference | Reason |
|------|-----------|--------|
| `scripts/deploy_services.py:26` | `"frontend": "im-frontend"` | Docker Compose service alias — service name doesn't change |
| `scripts/deploy_services.py:31` | `"im-frontend"` in APP_SERVICES | Docker Compose service name |
| `scripts/init_db.py:24` | `"im-frontend"` in APPLICATION_SERVICES | Docker Compose service name |
| `deploy/sit/docker-compose.yml:429-457` | `im-frontend:` service definition | Service name stays `im-frontend` |
| `.env.example:21,40` | `FRONTEND_PORT`, `FRONTEND_BUILD_MODE` | Env var names, not paths |
| `frontend/Dockerfile:19` | `ARG FRONTEND_BUILD_MODE=sit` | Build arg name, not a path |
| All `VITE_*` references in frontend source | `import.meta.env.VITE_*` | Vite runtime env, not filesystem paths |
| `frontend/vite.config.ts:33` | `resolve(__dirname, "src")` | Relative to vite.config.ts location |
| `frontend/tsconfig.json:18` | `"@/*": ["src/*"]` | Relative to tsconfig location |

---

## Recommendation

**Execution order for Phase 03 (Fix Path References):**

1. Move `frontend/` contents to `frontend/apps/web/` (Phase 02)
2. Fix P0 items (3 files) — Docker build breaks without these
3. Fix P1 items (.gitignore)
4. Fix P2 items (CLAUDE.md, AGENTS.md) — developer experience
5. Optionally fix P3 (package.json name)

All P0 fixes are in 3 files: `deploy/sit/docker-compose.yml`, `scripts/deploy_utils.py`, `scripts/generate_env.py`.
