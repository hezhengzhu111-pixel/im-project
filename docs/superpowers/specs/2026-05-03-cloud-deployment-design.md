# Cloud Server Deployment Design Spec

Date: 2026-05-03
Status: Draft
Scope: Production-ready deployment configuration for JD Cloud ECS (2-core 8GB RAM)

## Background

The IM platform currently uses SIT-mode configuration with weak passwords, no gzip compression, no security headers, and no application-level Docker healthchecks. This spec covers all changes needed to deploy the full stack to a JD Cloud ECS instance with IP-only access (no domain, no SSL).

## Constraints

- **Server**: JD Cloud ECS, 2-core 8GB RAM
- **Access**: IP only (no domain, no SSL certificate)
- **Redis shards**: 1 (SIT mode) — 4 shards would consume ~4GB RAM, leaving insufficient headroom on 8GB
- **File storage**: Local Docker volume (adequate for small-scale)
- **Chinese mirrors**: Retained (JD Cloud is in mainland China)

---

## Subtask A: Generate Strong Passwords for `.env`

**Goal**: Replace all weak credentials with cryptographically strong random values.

### A1. Generate passwords

Generate the following using `openssl rand` or Python `secrets`:

| Variable | Length | Format |
|----------|--------|--------|
| `MYSQL_ROOT_PASSWORD` | 32 chars | alphanumeric |
| `REDIS_PASSWORD` | 32 chars | alphanumeric |
| `JWT_SECRET` | 64 bytes | base64 |
| `AUTH_REFRESH_SECRET` | 64 bytes | base64 |
| `IM_INTERNAL_SECRET` | 64 bytes | base64 |
| `IM_GATEWAY_AUTH_SECRET` | 64 bytes | base64 |
| `IM_AI_ENCRYPTION_KEY` | 32 bytes | base64 (AES-256 key) |

### A2. Create `.env.production` template

Create `.env.example` with `change_me_*` placeholders and a generation script `scripts/generate_env.py` that:
1. Reads `.env.example`
2. Generates random values for each `change_me_*` placeholder
3. Writes `.env` with the generated values
4. Prints a summary of generated credentials

### A3. Keep SIT-mode shard counts

```
IM_PRIVATE_HOT_SHARDS=1
IM_GROUP_HOT_SHARDS=1
FRONTEND_BUILD_MODE=sit
```

### Verification

- `.env` contains no `root123` or `change_me_*` values
- All secrets are at least 32 bytes
- `docker compose config` validates without errors

---

## Subtask B: Nginx Configuration Enhancement

**Goal**: Add gzip compression and security headers without breaking existing functionality.

### B1. Add gzip to `nginx-main.conf`

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1000;
gzip_types
  text/plain
  text/css
  text/xml
  text/javascript
  application/json
  application/javascript
  application/xml
  application/rss+xml
  image/svg+xml;
```

### B2. Add security headers to `nginx.conf` server block

```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

### B3. Restrict HTTP methods in API/WebSocket locations

```nginx
# In /api location
limit_except GET POST PUT PATCH DELETE OPTIONS {
    deny all;
}
```

### Verification

- `nginx -t` passes inside the container
- Static assets served with `Content-Encoding: gzip`
- Response headers include security headers
- API endpoints still functional

---

## Subtask C: Docker Healthchecks

**Goal**: Enable Docker-level health monitoring for all application containers.

### C1. Add healthcheck to `im-api-server` in `docker-compose.yml`

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8082/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 15s
```

### C2. Add healthcheck to `im-server`

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8083/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

### C3. Add healthcheck to `im-spring-ai`

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8084/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

### C4. Add healthcheck to `im-frontend`

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

### C5. Ensure healthcheck tools are available in runtime images

The Rust runtime images (`debian:bookworm-slim`) include neither `curl` nor `wget`. Options:
- **Option A**: Install `curl` in Dockerfile via `apt-get install -y --no-install-recommends curl` (adds ~5MB)
- **Option B**: Use `CMD-SHELL` with `/bin/sh -c` and a shell-based TCP check

**Recommendation**: Option A — install `curl` in both Rust Dockerfiles. It's the most reliable healthcheck method and 5MB is negligible.

For `im-spring-ai` (`eclipse-temurin:25-jre-noble`): `curl` is available via `apt-get`. Install in Dockerfile.
For `im-frontend` (`nginx:1.27-alpine`): `wget` is available in Alpine by default. Use `wget -q --spider`.

### Verification

- `docker compose ps` shows all containers as `healthy`
- Unhealthy containers are auto-restarted by Docker

---

## Subtask D: Deployment Script Updates

**Goal**: Make deployment scripts production-ready.

### D1. Update `deploy_utils.py` to support environment selection

Add `--env` flag to select compose file:
- `sit` → `deploy/sit/docker-compose.yml` (default)
- `prod` → `deploy/prod/docker-compose.yml` (future)

For now, just document that SIT config is used for single-server production.

### D2. Update `deploy_services.py` to pass `--build` correctly

Ensure `FRONTEND_BUILD_MODE` build arg is passed from `.env` to docker compose build.

### Verification

- `python scripts/deploy_middleware.py` starts all middleware
- `python scripts/deploy_services.py` builds and starts all services
- All containers healthy after deployment

---

## Subtask E: Deployment Documentation

**Goal**: Create a step-by-step deployment guide.

### E1. Create `docs/deployment/cloud-deployment.md`

Contents:
1. **Prerequisites**: Docker, Docker Compose, Python 3.8+, git
2. **Server setup**: Security group rules (ports 80, 8082, 8083, 8084)
3. **Clone and configure**:
   ```bash
   git clone <repo>
   cd new-im-project
   python scripts/generate_env.py  # generates .env with strong passwords
   ```
4. **Deploy**:
   ```bash
   python scripts/deploy_middleware.py
   python scripts/init_db.py --full
   python scripts/deploy_services.py
   ```
5. **Verify**:
   ```bash
   curl http://<SERVER_IP>/          # frontend
   curl http://<SERVER_IP>:8082/health  # API server
   python scripts/test.py
   ```
6. **Troubleshooting**: Common issues and solutions

### Verification

- Documentation is complete and accurate
- Commands are tested on a clean environment

---

## File Change Matrix

| File | Subtask | Action |
|------|---------|--------|
| `.env.example` | A | Update placeholder format |
| `scripts/generate_env.py` | A | Create |
| `.env` | A | Generate with strong passwords |
| `frontend/nginx-main.conf` | B | Add gzip config |
| `frontend/nginx.conf` | B | Add security headers, restrict methods |
| `deploy/sit/docker-compose.yml` | C | Add healthchecks |
| `backend/api-server-rs/Dockerfile` | C | Install curl for healthcheck |
| `backend/im-server-rs/Dockerfile` | C | Install curl for healthcheck |
| `backend/spring-ai/Dockerfile` | C | Install curl for healthcheck |
| `scripts/deploy_services.py` | D | Minor updates |
| `docs/deployment/cloud-deployment.md` | E | Create |

## Out of Scope

- SSL/TLS configuration (no domain/certificate)
- CI/CD pipeline
- Redis shard scaling
- Object storage migration
- Rate limiting
- Database backup automation
