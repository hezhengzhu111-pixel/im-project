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
