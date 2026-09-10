/**
 * 轻量级内存限流中间件（防止暴力破解与接口滥用）。
 * 单实例部署足够；多实例部署请替换为 Redis 等共享存储。
 */

const stores = new Map()

function createRateLimiter({ windowMs = 60 * 1000, max = 30, message = '请求过于频繁，请稍后再试', keyGenerator } = {}) {
  const hits = new Map()

  // 定期清理过期记录，避免内存无限增长
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of hits) {
      if (entry.expiresAt <= now) hits.delete(key)
    }
  }, windowMs)
  if (typeof timer.unref === 'function') timer.unref()

  stores.set(hits, timer)

  return function rateLimiter(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : (req.ip || req.socket?.remoteAddress || 'unknown')
    const now = Date.now()
    let entry = hits.get(key)

    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs }
      hits.set(key, entry)
    }

    entry.count += 1

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.expiresAt - now) / 1000)))
      return res.status(429).json({ success: false, error: message, message, code: 'RATE_LIMITED' })
    }

    return next()
  }
}

module.exports = { createRateLimiter }
