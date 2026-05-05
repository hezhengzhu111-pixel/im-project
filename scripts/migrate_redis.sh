#!/bin/bash
# Redis migration script: merge 4 low-load instances into im-redis-shared
# Uses docker exec to access Redis containers directly.
# Prefix isolation: route: / evt_priv: / evt_grp: / default:
#
# Usage:
#   ./scripts/migrate_redis.sh [--dry-run] [--resume]
#
# Environment:
#   REDIS_PASSWORD — shared password (default: root123)

set -euo pipefail

REDIS_PASSWORD="${REDIS_PASSWORD:-root123}"
SRC_ROUTE="sit-im-redis-route-1"
SRC_EVT_PRIV="sit-im-redis-events-private-1"
SRC_EVT_GRP="sit-im-redis-events-group-1"
SRC_MAIN="sit-im-redis-1"
DST_SHARED="sit-im-redis-shared-1"
CHECKPOINT_DIR="${CHECKPOINT_DIR:-/tmp/redis_migrate_checkpoints}"
BATCH_SIZE="${BATCH_SIZE:-500}"
DRY_RUN=false
RESUME=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=true; shift ;;
        --resume) RESUME=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

mkdir -p "$CHECKPOINT_DIR"

docker_redis() {
    local container="$1"
    shift
    docker exec -i "$container" redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@" 2>/dev/null
}

key_count() {
    docker_redis "$1" DBSIZE | tr -d '\r\n'
}

checkpoint_file() { echo "${CHECKPOINT_DIR}/${1}"; }
restore_cursor() { cat "$(checkpoint_file "$1")" 2>/dev/null || echo "0"; }
save_cursor() { echo "$2" > "$(checkpoint_file "$1")"; }

migrate_instance() {
    local name="$1" src="$2" prefix="$3"
    local total_keys cursor migrated=0 skipped=0 error_count=0

    total_keys=$(key_count "$src")
    echo "[$(date '+%H:%M:%S')] Migrating $name ($src) → prefix '$prefix' | total_keys=$total_keys"

    if [ "$DRY_RUN" = true ]; then
        echo "  DRY RUN — would migrate ~$total_keys keys"
        return 0
    fi

    cursor=$(restore_cursor "$name")
    [ "$RESUME" = false ] && cursor="0"
    [ "$cursor" = "DONE" ] && { echo "  Already completed (checkpoint=DONE), skipping"; return 0; }

    while :; do
        local scan_result
        scan_result=$(docker_redis "$src" SCAN "$cursor" COUNT "$BATCH_SIZE" 2>/dev/null) || {
            error_count=$((error_count + 1))
            [ "$error_count" -ge 5 ] && { echo "  FATAL: too many SCAN errors"; return 1; }
            sleep 2; continue
        }

        cursor=$(echo "$scan_result" | head -1)
        local keys
        keys=$(echo "$scan_result" | tail -n +2)
        local key_list=()
        while IFS= read -r k; do [ -n "$k" ] && key_list+=("$k"); done <<< "$keys"

        local batch_size="${#key_list[@]}"
        if [ "$batch_size" -eq 0 ] && [ "$cursor" = "0" ]; then break; fi

        for key in "${key_list[@]}"; do
            local dump_result
            dump_result=$(docker_redis "$src" DUMP "$key") || { skipped=$((skipped + 1)); continue; }
            [ -z "$dump_result" ] && { skipped=$((skipped + 1)); continue; }

            local ttl
            ttl=$(docker_redis "$src" TTL "$key") || { skipped=$((skipped + 1)); continue; }
            [ "$ttl" = "-2" ] && { skipped=$((skipped + 1)); continue; }

            local new_key="${prefix}${key}"
            local restore_result
            if [ "$ttl" -gt 0 ]; then
                restore_result=$(docker_redis "$DST_SHARED" RESTORE "$new_key" 0 "$dump_result" REPLACE ABSTTL 2>/dev/null || echo "ERR")
            elif [ "$ttl" -eq -1 ]; then
                restore_result=$(docker_redis "$DST_SHARED" RESTORE "$new_key" 0 "$dump_result" REPLACE 2>/dev/null || echo "ERR")
            else
                skipped=$((skipped + 1)); continue
            fi

            if [ "$restore_result" = "OK" ]; then migrated=$((migrated + 1)); else skipped=$((skipped + 1)); fi
        done

        save_cursor "$name" "$cursor"
        echo "  cursor=$cursor migrated=$migrated skipped=$skipped batch=$batch_size"

        [ "$cursor" = "0" ] && break
    done

    local final_count
    final_count=$(key_count "$DST_SHARED")
    echo "  [$(date '+%H:%M:%S')] $name DONE: migrated=$migrated skipped=$skipped dest_dbsize=$final_count"
    save_cursor "$name" "DONE"
}

echo "============================================"
echo "  Redis Merge Migration (Docker)"
echo "  Sources: $SRC_ROUTE, $SRC_EVT_PRIV, $SRC_EVT_GRP, $SRC_MAIN"
echo "  Dest:    $DST_SHARED"
echo "  Mode: $( [ "$DRY_RUN" = true ] && echo 'DRY RUN' || echo 'REAL' )"
echo "============================================"

[ "$DRY_RUN" = false ] && { echo "Press Ctrl+C within 5s to abort..."; sleep 5; }

migrate_instance "route"        "$SRC_ROUTE"     "route:"     || exit 1
migrate_instance "events_priv"  "$SRC_EVT_PRIV"  "evt_priv:"  || exit 1
migrate_instance "events_group" "$SRC_EVT_GRP"   "evt_grp:"   || exit 1
migrate_instance "main"         "$SRC_MAIN"      "default:"   || exit 1

echo ""
echo "============================================"
echo "  Migration complete"
echo "  Destination keys: $(key_count "$DST_SHARED")"
echo "============================================"
