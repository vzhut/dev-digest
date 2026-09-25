# Rate limiting

`server/src/modules/rate-limit` counts hits per key in a `RateLimitStore`
(Redis `INCR` + `EXPIRE`). Limits: 100 per hour, 1000 for admins.
