#!/bin/bash
# Redis merge verification script
# Validates key count consistency, samples data integrity, and runs benchmarks.
#
# Usage:
#   ./scripts/verify_redis.sh [old|new|bench]

set -euo pipefail

REDIS_PASSWORD="${REDIS_PASSWORD:-root123}"
OLD_ROUTE_HOST="${OLD_ROUTE_HOST:-127.0.0.1}"
OLD_ROUTE_PORT="${OLD_ROUTE_PORT:-6382}"
OLD_EVT_PRIV_HOST="${OLD_EVT_PRIV_HOST:-127.0.0.1}"
OLD_EVT_PRIV_PORT="${OLD_EVT_PRIV_PORT:-6380}"
OLD_EVT_GRP_HOST="${OLD_EVT_GRP_HOST:-127.0.0.1}"
OLD_EVT_GRP_PORT="${OLD_EVT_GRP_PORT:-6381}"
OLD_MAIN_HOST="${OLD_MAIN_HOST:-127.0.0.1}"
OLD_MAIN_PORT="${OLD_MAIN_PORT:-6379}"
NEW_HOST="${NEW_SHARED_HOST:-127.0.0.1}"
NEW_PORT="${NEW_SHARED_PORT:-6379}"
SAMPLE_SIZE="${SAMPLE_SIZE:-100}"

REDIS_AUTH="-a ${REDIS_PASSWORD} --no-auth-warning"

redis_cmd() {
    redis-cli $REDIS_AUTH -h "$1" -p "$2" "$@"
}

# ─── 1. DBSIZE comparison ───────────────────────────────────────────
echo "============================================"
echo "  DBSIZE Comparison"
echo "============================================"

OLD_TOTAL=0
declare -A OLD_COUNTS
for name in "route:${OLD_ROUTE_HOST}:${OLD_ROUTE_PORT}" \
            "evt_priv:${OLD_EVT_PRIV_HOST}:${OLD_EVT_PRIV_PORT}" \
            "evt_grp:${OLD_EVT_GRP_HOST}:${OLD_EVT_GRP_PORT}" \
            "main:${OLD_MAIN_HOST}:${OLD_MAIN_PORT}"; do
    IFS=':' read -r label host port <<< "$name"
    count=$(redis_cmd "$host" "$port" DBSIZE 2>/dev/null || echo "ERR")
    OLD_COUNTS["$label"]="$count"
    printf "  old/%-12s : %8s keys\n" "$label" "$count"
    if [ "$count" != "ERR" ]; then
        OLD_TOTAL=$((OLD_TOTAL + count))
    fi
done

NEW_COUNT=$(redis_cmd "$NEW_HOST" "$NEW_PORT" DBSIZE 2>/dev/null || echo "ERR")
printf "  new/shared     : %8s keys\n\n" "$NEW_COUNT"

printf "  Old total : %8s\n" "$OLD_TOTAL"
printf "  New total : %8s\n" "$NEW_COUNT"
diff=$((NEW_COUNT - OLD_TOTAL))
printf "  Difference: %+8d\n" "$diff"

if [ "$diff" -ge 0 ] && [ "$diff" -lt "$((OLD_TOTAL / 20 + 5))" ]; then
    echo "  ✓ Key count within acceptable range"
else
    echo "  ✗ Key count mismatch — investigate!"
fi

# ─── 2. Prefix distribution ─────────────────────────────────────────
echo ""
echo "============================================"
echo "  Key Prefix Distribution (new instance)"
echo "============================================"

for prefix in "route:" "evt_priv:" "evt_grp:" "default:"; do
    count=$(redis_cmd "$NEW_HOST" "$NEW_PORT" --scan --pattern "${prefix}*" 2>/dev/null | wc -l)
    printf "  %-15s : %8s keys\n" "$prefix" "$count"
done

# ─── 3. Sample validation ───────────────────────────────────────────
echo ""
echo "============================================"
echo "  Sample Validation ($SAMPLE_SIZE keys per source)"
echo "============================================"

declare -A PREFIX_MAP
PREFIX_MAP["route"]="route:"
PREFIX_MAP["events_priv"]="evt_priv:"
PREFIX_MAP["events_group"]="evt_grp:"
PREFIX_MAP["main"]="default:"

declare -A HOST_MAP
HOST_MAP["route"]="${OLD_ROUTE_HOST}:${OLD_ROUTE_PORT}"
HOST_MAP["events_priv"]="${OLD_EVT_PRIV_HOST}:${OLD_EVT_PRIV_PORT}"
HOST_MAP["events_group"]="${OLD_EVT_GRP_HOST}:${OLD_EVT_GRP_PORT}"
HOST_MAP["main"]="${OLD_MAIN_HOST}:${OLD_MAIN_PORT}"

for source in route events_priv events_group main; do
    IFS=':' read -r src_host src_port <<< "${HOST_MAP[$source]}"
    prefix="${PREFIX_MAP[$source]}"
    local sampled=0 matched=0 mismatched=0 notfound=0

    while IFS= read -r key; do
        [ -z "$key" ] && continue
        sampled=$((sampled + 1))

        # Get old value
        old_type=$(redis_cmd "$src_host" "$src_port" TYPE "$key" 2>/dev/null)
        old_val=""
        case "$old_type" in
            string) old_val=$(redis_cmd "$src_host" "$src_port" GET "$key") ;;
            hash)   old_val=$(redis_cmd "$src_host" "$src_port" HGETALL "$key") ;;
            list)   old_val=$(redis_cmd "$src_host" "$src_port" LRANGE "$key" 0 -1) ;;
            set)    old_val=$(redis_cmd "$src_host" "$src_port" SMEMBERS "$key") ;;
            zset)   old_val=$(redis_cmd "$src_host" "$src_port" ZRANGE "$key" 0 -1 WITHSCORES) ;;
            stream) old_val="[stream]" ;;
            *)      old_val="" ;;
        esac

        # Get new value
        new_key="${prefix}${key}"
        new_type=$(redis_cmd "$NEW_HOST" "$NEW_PORT" TYPE "$new_key" 2>/dev/null)
        new_val=""
        case "$new_type" in
            string) new_val=$(redis_cmd "$NEW_HOST" "$NEW_PORT" GET "$new_key") ;;
            hash)   new_val=$(redis_cmd "$NEW_HOST" "$NEW_PORT" HGETALL "$new_key") ;;
            list)   new_val=$(redis_cmd "$NEW_HOST" "$NEW_PORT" LRANGE "$new_key" 0 -1) ;;
            set)    new_val=$(redis_cmd "$NEW_HOST" "$NEW_PORT" SMEMBERS "$new_key") ;;
            zset)   new_val=$(redis_cmd "$NEW_HOST" "$NEW_PORT" ZRANGE "$new_key" 0 -1 WITHSCORES) ;;
            stream) new_val="[stream]" ;;
            *)      new_val="" ;;
        esac

        if [ "$old_type" != "$new_type" ]; then
            mismatched=$((mismatched + 1))
        elif [ "$old_val" = "$new_val" ]; then
            matched=$((matched + 1))
        elif [ -z "$new_val" ]; then
            notfound=$((notfound + 1))
        else
            mismatched=$((mismatched + 1))
        fi
    done < <(redis_cmd "$src_host" "$src_port" --scan --pattern '*' 2>/dev/null | head -n "$SAMPLE_SIZE")

    printf "  %-15s : sampled=%-4d matched=%-4d mismatched=%-4d notfound=%-4d\n" \
        "$source" "$sampled" "$matched" "$mismatched" "$notfound"
done

# ─── 4. Benchmark (optional) ────────────────────────────────────────
if [ "${1:-}" = "bench" ]; then
    echo ""
    echo "============================================"
    echo "  redis-benchmark (new shared instance)"
    echo "============================================"
    redis-benchmark -h "$NEW_HOST" -p "$NEW_PORT" -a "$REDIS_PASSWORD" \
        -t set,get -n 10000 -q --csv 2>/dev/null || echo "  (redis-benchmark not available)"
fi

echo ""
echo "============================================"
echo "  Verification complete"
echo "============================================"
