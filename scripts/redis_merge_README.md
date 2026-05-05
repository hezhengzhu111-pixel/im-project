# Redis Merge — Low-Load Instance Consolidation

## Motivation

4 low-load Redis instances (route, events-private, events-group, main) each consume ~300-600MB memory and <25% CPU. Merging them into a single `im-redis-shared` container saves ~3 containers and ~1.5GB memory while keeping identical availability.

## Services Changed

| From | To |
|------|-----|
| `im-redis` (6379) | `im-redis-shared` (shared, no host port) |
| `im-redis-events-private` (6380) | `im-redis-shared` |
| `im-redis-events-group` (6381) | `im-redis-shared` |
| `im-redis-route` (6382) | `im-redis-shared` |

Hot instances (private-hot-{1-4}, group-hot-{1-4}) **unchanged**.

## Migration Steps

### 1. Start the shared Redis container

```bash
docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d im-redis-shared
```

### 2. Migrate data from old to new

```bash
# Dry-run first
./scripts/migrate_redis.sh --dry-run

# Real migration
export REDIS_PASSWORD=root123
./scripts/migrate_redis.sh 2>&1 | tee migrate.log
```

Supports `--resume` for interrupted migrations (checkpoint files in `/tmp/redis_migrate_checkpoints/`).

### 3. Verify migration

```bash
./scripts/verify_redis.sh
```

Checks: DBSIZE comparison, prefix distribution, sample key-value matching.

### 4. Switch application config

Already done in `docker-compose.yml` — the `im-server` and `im-api-server` services now point to `im-redis-shared:6379`.

### 5. Redeploy applications

```bash
docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d im-server im-api-server
```

### 6. Verify health

```bash
curl http://localhost:8082/health
curl http://localhost:8083/health
```

## Rollback

```bash
# Restore original URLs in docker-compose.yml
./scripts/rollback_redis.sh

# Restart apps with old Redis cluster
docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d im-server im-api-server
```

Old containers are preserved (not removed) — they still hold their original data for instant rollback.

## Performance Baseline

```bash
# Benchmark shared instance
redis-benchmark -h im-redis-shared -p 6379 -a root123 -t set,get -n 50000 -q
```

Expected: SET/GET throughput ~50k+ ops/sec (well within 0.5 CPU limit for <25% load profile).

## Cleanup (after validation period)

```bash
# Remove old containers after confirming no issues for 24h+
docker compose -f deploy/sit/docker-compose.yml rm -f im-redis im-redis-events-private im-redis-events-group im-redis-route
docker volume rm redis_data redis_private_events_data redis_group_events_data redis_route_data
```
