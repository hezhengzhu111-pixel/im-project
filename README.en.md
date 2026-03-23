# IM Project

An instant messaging system built with Java microservices and a Vue 3 frontend.

## Current boundaries

- `auth-service` is the single token service for issuing, parsing, refreshing, revoking, and minting WebSocket tickets.
- `admin-service` has been removed from the main build, startup scripts, and CI.
- WebSocket connections now use short-lived one-time `ticket` values instead of putting JWTs in the URL.

## Repository layout

- `backend/`: Spring Boot services and shared modules
- `frontend/`: Vue 3 + Vite client
- `.github/workflows/`: CI pipelines

## Required environment variables

Copy `.env.example` and provide values for:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `IM_INTERNAL_SECRET`
- `IM_GATEWAY_AUTH_SECRET`
- `GROUP_SERVICE_DATASOURCE_PASSWORD`
- `MESSAGE_SERVICE_DATASOURCE_PASSWORD`
- `USER_SERVICE_DATASOURCE_PASSWORD`
- `IM_SERVER_DATASOURCE_PASSWORD`

## Local development

Frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Backend verification:

```powershell
mvn -f backend/pom.xml test
```

Frontend verification:

```powershell
cd frontend
npm run typecheck
npm run test
npm run build
```

Start backend services in bulk:

```powershell
pwsh backend/start_all_services.ps1
```

## Common commands

- `make backend-test`
- `make frontend-typecheck`
- `make frontend-test`
- `make frontend-build`
- `make quality`

## CI

The default quality gate runs:

- `mvn -f backend/pom.xml test`
- `npm ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`
