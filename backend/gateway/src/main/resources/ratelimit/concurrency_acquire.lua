local key = KEYS[1]
local max_permits = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])
local permit_id = ARGV[3]
local now_millis = tonumber(ARGV[4])
local ttl_millis = math.max(1, ttl_seconds) * 1000
local expire_at = now_millis + ttl_millis

redis.call("zremrangebyscore", key, "-inf", now_millis)

local current = redis.call("zcard", key)
if current >= max_permits then
    if current > 0 then
        redis.call("pexpire", key, ttl_millis)
    end
    return 0
end

redis.call("zadd", key, expire_at, permit_id)
redis.call("pexpire", key, ttl_millis)
return 1
