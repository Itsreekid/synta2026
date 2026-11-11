export function authRateLimit(limit, windowMs = 15 * 60 * 1000, keyFor = req => req.ip) {
  const attempts = new Map();
  let nextCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextCleanup) {
      for (const [key, bucket] of attempts) {
        if (bucket.expires <= now) attempts.delete(key);
      }
      nextCleanup = now + windowMs;
    }

    const key = keyFor(req);
    let bucket = attempts.get(key);
    if ((!bucket || bucket.expires <= now) && attempts.size < 10000) {
      bucket = { expires: now + windowMs, count: 0 };
      attempts.set(key, bucket);
    }
    if (!bucket || bucket.count >= limit) {
      res.set("Retry-After", String(Math.max(1, Math.ceil(((bucket?.expires || nextCleanup) - now) / 1000))));
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
    }
    bucket.count++;
    next();
  };
}
