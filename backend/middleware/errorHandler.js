const { AppError } = require('../utils/response')
const config = require('../config')
const logger = require('../utils/logger')

const errorHandler = (err, req, res, next) => {
  const isProduction = config.nodeEnv === 'production'

  if (res.headersSent) {
    // 响应已经开始（例如 SSE 流），只能中断连接
    logger.error('响应已发送后发生错误', { path: req.originalUrl, error: err.message })
    return next(err)
  }

  // multer 上传错误（文件过大、类型不符）应返回 400 而非 500
  if (err.name === 'MulterError' || (err.message && /^只支持/.test(err.message))) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? '文件大小超出限制'
      : err.message || '文件上传失败'
    return res.status(400).json({ success: false, error: message, message, code: 'UPLOAD_ERROR' })
  }

  // 请求体解析错误（非法 JSON / 超出大小限制）
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: '请求体不是合法的 JSON', message: '请求体不是合法的 JSON', code: 'INVALID_JSON' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: '请求体过大', message: '请求体过大', code: 'PAYLOAD_TOO_LARGE' })
  }

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.message,
      code: err.code
    })
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: '无效的认证令牌', message: '无效的认证令牌', code: 'INVALID_TOKEN' })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: '认证令牌已过期', message: '认证令牌已过期', code: 'TOKEN_EXPIRED' })
  }

  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({ success: false, error: '数据已存在或违反约束', message: '数据已存在或违反约束', code: 'CONSTRAINT_ERROR' })
  }

  logger.error('系统错误', {
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: isProduction ? undefined : err.stack
  })

  return res.status(500).json({
    success: false,
    error: isProduction ? '服务器内部错误' : err.message,
    message: isProduction ? '服务器内部错误' : err.message,
    code: 'INTERNAL_ERROR'
  })
}

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: '请求的接口不存在',
    message: '请求的接口不存在',
    code: 'NOT_FOUND'
  })
}

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError
}
