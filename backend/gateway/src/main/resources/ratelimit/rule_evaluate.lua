local tokens_key = KEYS[1]
local timestamp_key = KEYS[2]
local concurrency_key = KEYS[3]

local qps_enabled = tonumber(ARGV[1]) == 1
local replenish_rate = tonumber(ARGV[2])
local burst_capacity = tonumber(ARGV[3])
local requested_tokens = tonumber(ARGV[4])
local concurrency_enabled = tonumber(ARGV[5]) == 1
local max_permits = tonumber(ARGV[6])
local ttl_seconds = tonumber(ARGV[7])
local permit_id = ARGV[8]
local now_millis = tonumber(ARGV[9])

local function format_result(allowed, reason, permit_granted, permit_value)
    local effective_permit = permit_value
    if effective_permit == nil then
        effective_permit = ""
    end
    return tostring(allowed) .. "|" .. reason .. "|" .. tostring(permit_granted) .. "|" .. effective_permit
end

if qps_enabled then
    local fill_time = burst_capacity / replenish_rate
    local ttl_seconds_qps = math.floor(fill_time * 2)
    if ttl_seconds_qps < 1 then
        ttl_seconds_qps = 1
    end

    local last_tokens = tonumber(redis.call("get", tokens_key))
    if last_tokens == nil then
        last_tokens = burst_capacity
    end

    local last_refreshed = tonumber(redis.call("get", timestamp_key))
    if last_refreshed == nil then
        last_refreshed = now_millis
    end

    local delta = math.max(0, now_millis - last_refreshed) / 1000.0
    local filled_tokens = math.min(burst_capacity, last_tokens + (delta * replenish_rate))
    local qps_allowed = filled_tokens >= requested_tokens
    local new_tokens = filled_tokens

    if qps_allowed then
        new_tokens = filled_tokens - requested_tokens
    end

    redis.call("setex", tokens_key, ttl_seconds_qps, new_tokens)
    redis.call("setex", timestamp_key, ttl_seconds_qps, now_millis)

    if not qps_allowed then
        return format_result(0, "QPS", 0, "")
    end
end

if concurrency_enabled then
    local ttl_millis = math.max(1, ttl_seconds) * 1000
    local expire_at = now_millis + ttl_millis

    redis.call("zremrangebyscore", concurrency_key, "-inf", now_millis)

    local current = redis.call("zcard", concurrency_key)
    if current >= max_permits then
        if current > 0 then
            redis.call("pexpire", concurrency_key, ttl_millis)
        end
        return format_result(0, "CONCURRENCY", 0, "")
    end

    redis.call("zadd", concurrency_key, expire_at, permit_id)
    redis.call("pexpire", concurrency_key, ttl_millis)
    return format_result(1, "ALLOW", 1, permit_id)
end

return format_result(1, "ALLOW", 0, "")
