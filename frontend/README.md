# Frontend Workspace

npm workspaces monorepo for the IM frontend.

## Structure

- `apps/web` — Vue 3 + Vite + Pinia + Element Plus web application
- `packages/*` — Shared framework-agnostic packages

## Packages

| Package | Description | Dependencies |
|---------|-------------|--------------|
| `@im/shared-types` | Core TypeScript type definitions (API, auth, user, message, session, friend, group, websocket, moments) | — |
| `@im/shared-utils` | Pure utility functions (validation, masking, trace ID generation) with no browser/platform dependencies | — |
| `@im/shared-api-contract` | API endpoint constants and WS message type codes for all services | — |
| `@im/shared-platform-ports` | Port interfaces (StoragePort, HttpClientPort, LoggerPort, NotifierPort, etc.) for dependency injection | — |
| `@im/shared-auth-core` | JWT token parsing, refresh failure classification, refresh coordinator, auth endpoint skip logic | — |
| `@im/shared-normalizers` | DTO-to-domain normalizers for messages, chats, users, groups, friend requests, moments | `@im/shared-types` |
| `@im/shared-im-core` | IM domain logic: session ID building, message identity/sort/dedup/window/filter, read receipts | `@im/shared-types`, `@im/shared-normalizers` |
| `@im/shared-ws-core` | WebSocket utilities: ticket URL construction, heartbeat payload, payload parsing, reconnect strategy | `@im/shared-api-contract` |

### Dependency Graph

```
shared-types
  ├── shared-normalizers
  │     └── shared-im-core
  └── shared-im-core

shared-api-contract
  └── shared-ws-core

shared-utils          (standalone)
shared-auth-core      (standalone)
shared-platform-ports (standalone)
```

## Commands

Run all install, build, typecheck, and test commands from this `frontend/` workspace root.

```bash
cd frontend
npm install              # Install all workspace dependencies and update the root package-lock.json
npm run web:dev          # Web dev server
npm run web:build        # Production web build
npm run typecheck        # Type check all packages + apps
npm run test             # Run all tests across workspaces
```

### Per-package commands

```bash
# Type check a single package
npm run typecheck --workspace=@im/shared-types

# Run tests for packages that have them
npm run test --workspace=@im/shared-auth-core
npm run test --workspace=@im/shared-im-core
npm run test --workspace=@im/shared-normalizers
npm run test --workspace=@im/shared-ws-core
```
