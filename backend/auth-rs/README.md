# im-auth-rs

Rust implementation of the IM auth service.

This service is designed to be wire-compatible with the current Java `auth-service` for the Gateway-facing contract:

- `POST /refresh`
- `POST /parse`
- `POST /ws-ticket`
- `POST /api/auth/internal/token`
- `GET /api/auth/internal/user-resource/{userId}`
- `POST /api/auth/internal/validate-token`
- `POST /api/auth/internal/introspect`
- `POST /api/auth/internal/ws-introspect`
- `POST /api/auth/internal/check-permission`
- `POST /api/auth/internal/revoke-token`
- `POST /api/auth/internal/revoke-user-tokens/{userId}`
- `POST /api/auth/internal/ws-ticket/consume`

The Redis keys, token claims, response envelope, and Gateway/internal HMAC headers intentionally match the Java service.

## Run and Test

Local Rust:

```powershell
cd backend\auth-rs
cargo test
cargo run
```

Docker, useful when the host Rust toolchain is restricted:

```powershell
docker run --rm --mount type=bind,source="${PWD}",target=/app -w /app rust:1.95-bookworm cargo test
docker build -t im-auth-rs .
```

Important environment variables:

- `AUTH_RS_PORT`, default `8084`
- `REDIS_URL`, default `redis://127.0.0.1:6379/0`
- `JWT_SECRET`
- `AUTH_REFRESH_SECRET`
- `IM_INTERNAL_SECRET`
- `IM_GATEWAY_AUTH_SECRET`
