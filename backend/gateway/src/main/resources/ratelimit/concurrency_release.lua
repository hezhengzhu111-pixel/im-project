local key = KEYS[1]
local permit_id = ARGV[1]

if permit_id == nil or permit_id == "" then
    return 0
end

return redis.call("zrem", key, permit_id)
