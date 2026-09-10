const config = require('../config')

const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
}

const currentLevel = config.nodeEnv === 'production' ? LogLevel.INFO : LogLevel.DEBUG

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString()
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  return `[${timestamp}] [${level}] ${message}${metaStr}`
}

const error = (message, meta) => {
  if (currentLevel >= LogLevel.ERROR) {
    console.error(formatMessage('ERROR', message, meta))
  }
}

const warn = (message, meta) => {
  if (currentLevel >= LogLevel.WARN) {
    console.warn(formatMessage('WARN', message, meta))
  }
}

const info = (message, meta) => {
  if (currentLevel >= LogLevel.INFO) {
    console.log(formatMessage('INFO', message, meta))
  }
}

const debug = (message, meta) => {
  if (currentLevel >= LogLevel.DEBUG) {
    console.log(formatMessage('DEBUG', message, meta))
  }
}

const requestLogger = (req, res, next) => {
  const start = Date.now()
  const { method, url } = req

  res.on('finish', () => {
    const duration = Date.now() - start
    const { statusCode } = res
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info'
    const log = level === 'error' ? error : level === 'warn' ? warn : info
    log(`${method} ${url} ${statusCode} - ${duration}ms`, {
      ip: req.ip,
      userAgent: req.get('user-agent')
    })
  })

  next()
}

module.exports = {
  error,
  warn,
  info,
  debug,
  requestLogger
}