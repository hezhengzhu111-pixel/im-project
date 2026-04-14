local key = KEYS[1]
local max_permits = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])

local current = tonumber(redis.call("get", key))
if current == nil then
    current = 0
end

if current >= max_permits then
    return 0
end

current = redis.call("incr", key)
redis.call("expire", key, ttl_seconds)
return 1
