local key = KEYS[1]
local current = tonumber(redis.call("get", key))

if current == nil or current <= 1 then
    redis.call("del", key)
    return 0
end

return redis.call("decr", key)
