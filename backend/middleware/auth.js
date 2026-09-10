const jwt = require('jsonwebtoken')
const config = require('../config')

/**
 * 从 Authorization 头中提取 Bearer Token。
 * 出于安全考虑不再支持从 URL query 读取 token（会泄漏到日志、Referer 与浏览器历史）。
 */
function extractToken(req) {
  const header = req.headers.authorization || ''
  const parts = header.split(' ')
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1]
  }
  return null
}

function authMiddleware(req, res, next) {
  const token = extractToken(req)
  if (!token) {
    return res.status(401).json({ success: false, error: '未提供认证令牌', message: '未提供认证令牌', code: 'NO_TOKEN' })
  }

  try {
    req.user = jwt.verify(token, config.jwt.secret)
    return next()
  } catch (err) {
    const expired = err.name === 'TokenExpiredError'
    return res.status(401).json({
      success: false,
      error: expired ? '认证令牌已过期' : '无效的认证令牌',
      message: expired ? '认证令牌已过期' : '无效的认证令牌',
      code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    })
  }
}

/**
 * 角色校验中间件，必须在 authMiddleware 之后使用。
 * @param  {...string} roles 允许访问的角色
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: '未提供认证令牌', message: '未提供认证令牌', code: 'NO_TOKEN' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: '无权操作', message: '无权操作', code: 'FORBIDDEN' })
    }
    return next()
  }
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  )
}

module.exports = {
  authMiddleware,
  requireRole,
  generateToken,
  JWT_SECRET: config.jwt.secret
}
