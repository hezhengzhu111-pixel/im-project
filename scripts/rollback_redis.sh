#!/bin/bash
# Rollback: switch from im-redis-shared back to 4 standalone Redis instances
# This script restores the ORIGINAL docker-compose URL mappings.
#
# Usage:
#   ./scripts/rollback_redis.sh [--dry-run]
#
# This MUST be run before restarting the application containers.

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" = "--dry-run" ]] && DRY_RUN=true

COMPOSE_FILE="deploy/sit/docker-compose.yml"

echo "============================================"
echo "  Redis Rollback: im-redis-shared → 4 standalone"
echo "  Mode: $( [ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'REAL' )"
echo "============================================"

if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "Would restore these URLs in $COMPOSE_FILE:"
    echo "  im-server:"
    echo "    REDIS_URL → im-redis-route:6379"
    echo "    IM_ROUTE_REDIS_URL → im-redis-route:6379"
    echo "  im-api-server:"
    echo "    REDIS_URL → im-redis:6379"
    echo "    IM_CACHE_REDIS_URL → im-redis:6379"
    echo "    IM_PRIVATE_EVENT_REDIS_URL → im-redis-events-private:6379"
    echo "    IM_GROUP_EVENT_REDIS_URL → im-redis-events-group:6379"
    echo "    IM_ROUTE_REDIS_URL → im-redis-route:6379"
    echo ""
    exit 0
fi

# Restore im-server URLs
sed -i 's|redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0|redis://:${REDIS_PASSWORD:-root123}@im-redis-route:6379/0|g' "$COMPOSE_FILE"

# Restore im-api-server URLs  
sed -i 's|redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0|redis://:${REDIS_PASSWORD:-root123}@im-redis:6379/0|g' "$COMPOSE_FILE"
sed -i 's|IM_CACHE_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0"|IM_CACHE_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis:6379/0"|' "$COMPOSE_FILE"
sed -i 's|IM_PRIVATE_EVENT_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0"|IM_PRIVATE_EVENT_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-events-private:6379/0"|' "$COMPOSE_FILE"
sed -i 's|IM_GROUP_EVENT_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0"|IM_GROUP_EVENT_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-events-group:6379/0"|' "$COMPOSE_FILE"
sed -i 's|IM_ROUTE_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-shared:6379/0"|IM_ROUTE_REDIS_URL: "redis://:${REDIS_PASSWORD:-root123}@im-redis-route:6379/0"|' "$COMPOSE_FILE"

echo ""
echo "Rollback complete. Restart containers:"
echo "  docker compose --env-file .env -f deploy/sit/docker-compose.yml up -d im-server im-api-server"
