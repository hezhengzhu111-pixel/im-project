local tokens_key = KEYS[1]
local timestamp_key = KEYS[2]

local replenish_rate = tonumber(ARGV[1])
local burst_capacity = tonumber(ARGV[2])
local requested_tokens = tonumber(ARGV[3])
local now_millis = tonumber(ARGV[4])

local fill_time = burst_capacity / replenish_rate
local ttl_seconds = math.floor(fill_time * 2)
if ttl_seconds < 1 then
    ttl_seconds = 1
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
local allowed = filled_tokens >= requested_tokens
local new_tokens = filled_tokens

if allowed then
    new_tokens = filled_tokens - requested_tokens
end

redis.call("setex", tokens_key, ttl_seconds, new_tokens)
redis.call("setex", timestamp_key, ttl_seconds, now_millis)

if allowed then
    return 1
end
return 0
