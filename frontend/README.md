# Frontend Workspace

npm workspaces monorepo for the IM frontend.

## Structure

- `apps/web` - Vue 3 + Vite + Pinia + Element Plus web application.
- `apps/mobile` - Android-first Bare React Native mobile application, package `@im/mobile`.
- `packages/*` - Shared framework-agnostic packages.

## Packages

| Package | Description | Dependencies |
|---|---|---|
| `@im/shared-types` | Core TypeScript type definitions for API, auth, user, message, session, friend, group, websocket, and moments. | none |
| `@im/shared-utils` | Pure utility functions with no browser/platform dependencies. | none |
| `@im/shared-api-contract` | API endpoint constants and WS message type codes. | none |
| `@im/shared-platform-ports` | Port interfaces for storage, HTTP, logging, notification, and platform dependencies. | none |
| `@im/shared-auth-core` | JWT parsing, refresh classification, refresh coordinator, and auth endpoint skip logic. | none |
| `@im/shared-normalizers` | DTO-to-domain normalizers for messages, chats, users, groups, friend requests, and moments. | `@im/shared-types` |
| `@im/shared-im-core` | IM domain logic for session ids, message identity/sort/dedup/window/filter, and read receipts. | `@im/shared-types`, `@im/shared-normalizers` |
| `@im/shared-ws-core` | WebSocket utilities for ticket URLs, heartbeat payload, payload parsing, and reconnect strategy. | `@im/shared-api-contract` |

## Dependency Graph

```text
shared-types
  -> shared-normalizers
       -> shared-im-core
  -> shared-im-core

shared-api-contract
  -> shared-ws-core

shared-utils          (standalone)
shared-auth-core      (standalone)
shared-platform-ports (standalone)
```

## Commands

Run install, build, typecheck, and test commands from this `frontend/` workspace root.

```bash
cd frontend
npm install              # Install all workspace dependencies and update package-lock.json
npm run web:dev          # Web dev server
npm run web:build        # Production web build
npm run typecheck        # Type check all packages + apps
npm run test             # Run all tests across workspaces
```

## Mobile Commands

```bash
cd frontend
npm run mobile:start     # Start Metro
npm run mobile:android   # Build/install/run Android app
npm run mobile:typecheck # Type check @im/mobile
npm run mobile:test      # Run mobile Jest tests
npm run mobile:lint      # Lint mobile app
npm run mobile:clean     # Clean Android Gradle build outputs
npm run mobile:ios       # iOS structure exists, not a validation target for this phase
```

See `apps/mobile/README.md`, `apps/mobile/ANDROID_RUNBOOK.md`, `apps/mobile/LOCAL_STORAGE_DESIGN.md`, `apps/mobile/PUSH_BACKEND_CONTRACT.md`, and `apps/mobile/MOBILE_PARITY_MATRIX.md` for mobile details.

## Per-Package Commands

```bash
npm run typecheck --workspace=@im/shared-types
npm run test --workspace=@im/shared-auth-core
npm run test --workspace=@im/shared-im-core
npm run test --workspace=@im/shared-normalizers
npm run test --workspace=@im/shared-ws-core
```
