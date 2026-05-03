# Cloud Server Deployment Guide

Target: JD Cloud ECS, 2-core 8GB RAM, IP-only access (no domain/SSL)

## Prerequisites

- Docker 24+ and Docker Compose v2
- Python 3.8+
- Git
- Ports 80, 8082, 8083, 8084 open in security group

## 1. Server Setup

### Security Group Rules

| Port | Protocol | Purpose |
|------|----------|---------|
| 80 | TCP | Frontend (Nginx) |
| 8082 | TCP | API Server |
| 8083 | TCP | IM Server (WebSocket) |
| 8084 | TCP | Spring AI |

### Install Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect
```

## 2. Clone and Configure

```bash
git clone <your-repo-url> new-im-project
cd new-im-project
python scripts/generate_env.py
```

This generates `.env` with strong random passwords. Review the output and save the credentials.

## 3. Deploy Middleware

```bash
python scripts/deploy_middleware.py
```

This starts: MySQL, Redis, Redis hot shards (1 private + 1 group), and the file volume initializer.

Wait for all services to become healthy (~30s).

## 4. Initialize Database

```bash
python scripts/init_db.py --full
```

This creates all 9 databases and imports the schema.

## 5. Deploy Application Services

```bash
python scripts/deploy_services.py
```

This builds and starts: im-server, im-api-server, im-frontend, im-spring-ai.

First build takes 10-20 minutes. Subsequent builds are faster due to Docker layer caching.

## 6. Verify Deployment

```bash
# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost/
# Expected: 200

# API Server
curl -s http://localhost:8082/health
# Expected: {"status":"ok"} or similar

# IM Server
curl -s http://localhost:8083/health
# Expected: {"status":"ok"} or similar

# Full integration test
python scripts/full_backend_api_test.py
```

## 7. Access the App

Open `http://<SERVER_IP>` in a browser.

## Troubleshooting

### Container won't start

```bash
docker compose -f deploy/sit/docker-compose.yml --env-file .env logs <service-name>
```

### MySQL connection refused

Check if MySQL is healthy:
```bash
docker compose -f deploy/sit/docker-compose.yml ps im-mysql
```

### Frontend shows 502

API server may not be ready yet. Check:
```bash
curl http://localhost:8082/health
docker compose -f deploy/sit/docker-compose.yml logs im-api-server
```

### Out of memory

2-core 8GB is tight. If containers are OOM-killed:
- Reduce Redis shard count to 1 (already default in SIT mode)
- Reduce `IM_MYSQL_MAX_CONNECTIONS` from 64 to 32
- Reduce `IM_EVENT_STREAM_MAX_LEN` from 100000 to 50000

### Rebuild after code changes

```bash
python scripts/deploy_services.py --no-deps
```

### Reset everything

```bash
python scripts/docker_clean.py --yes --volumes
python scripts/deploy_middleware.py
python scripts/init_db.py --full
python scripts/deploy_services.py
```
