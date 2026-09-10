class AppError extends Error {
  constructor(message, statusCode, code = 'ERROR') {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

const success = (res, data = null, message = '操作成功') => {
  return res.json({
    success: true,
    message,
    data
  })
}

const error = (res, message = '操作失败', statusCode = 500, code = 'ERROR') => {
  return res.status(statusCode).json({
    success: false,
    message,
    code
  })
}

const created = (res, data = null, message = '创建成功') => {
  return res.status(201).json({
    success: true,
    message,
    data
  })
}

const badRequest = (res, message = '请求参数错误', code = 'BAD_REQUEST') => {
  return res.status(400).json({
    success: false,
    message,
    code
  })
}

const unauthorized = (res, message = '未授权', code = 'UNAUTHORIZED') => {
  return res.status(401).json({
    success: false,
    message,
    code
  })
}

const forbidden = (res, message = '禁止访问', code = 'FORBIDDEN') => {
  return res.status(403).json({
    success: false,
    message,
    code
  })
}

const notFound = (res, message = '资源不存在', code = 'NOT_FOUND') => {
  return res.status(404).json({
    success: false,
    message,
    code
  })
}

module.exports = {
  AppError,
  success,
  error,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound
}