const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const fs = require('fs')
const path = require('path')
const config = require('./config')
const db = require('./database')
const logger = require('./utils/logger')
const { createRateLimiter } = require('./middleware/rateLimit')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')
const authRoutes = require('./routes/auth')
const taskRoutes = require('./routes/tasks')
const submissionRoutes = require('./routes/submissions')
const userRoutes = require('./routes/users')
const dataManageRoutes = require('./routes/data-manage')
const equipmentRoutes = require('./routes/equipments')
const { router: notificationRoutes } = require('./routes/notifications')
const captchaRoutes = require('./routes/captcha')
const emailRoutes = require('./routes/email')
const aiRoutes = require('./routes/ai')
const attendanceRoutes = require('./routes/attendance')

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

// 基础安全响应头（不引入额外依赖）
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('X-Frame-Options', 'SAMEORIGIN')
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  if (config.isProduction) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

app.use(cors({ origin: config.cors.origin }))
app.use(bodyParser.json({ limit: '50mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))
app.use(logger.requestLogger)

// 全局限流：防止接口滥用
app.use('/api', createRateLimiter({ windowMs: 60 * 1000, max: 600 }))

app.use('/uploads', express.static(path.join(__dirname, config.upload.path), {
  dotfiles: 'deny',
  index: false,
  setHeaders: function(res, filePath, stat) {
    const ext = path.extname(filePath).toLowerCase()
    const mimeMap = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp', '.pdf': 'application/pdf',
      '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain', '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed'
    }
    const contentType = mimeMap[ext] || 'application/octet-stream'
    res.set('Content-Type', contentType)
    if (ext === '.pdf') {
      res.set('Content-Disposition', 'inline')
    }
    res.set('Access-Control-Expose-Headers', 'Content-Disposition')
  }
}))

app.get('/health', (req, res) => {
  res.json({ success: true, message: '服务正常运行', data: { uptime: process.uptime() } })
})

app.use('/api/auth', authRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/submissions', submissionRoutes)
app.use('/api/users', userRoutes)
app.use('/api/data-manage', dataManageRoutes)
app.use('/api/equipments', equipmentRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api', captchaRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/attendance', attendanceRoutes)

// 未匹配到的 API 请求统一返回 JSON 404，不能被前端 SPA 兜底路由吞掉
app.use('/api', notFoundHandler)

const frontendDist = config.frontendPath

app.use(express.static(frontendDist, { fallthrough: true, index: false }))

// SPA 兜底：仅处理非 API、非静态资源的 GET 请求
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return notFoundHandler(req, res)
  }
  const indexPath = path.resolve(frontendDist, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.status(503).json({ success: false, error: '前端未构建，请在 frontend 目录执行 npm run build', message: '前端未构建' })
  }
})

app.use(notFoundHandler)
app.use(errorHandler)

let server = null

db.initDatabase().then(() => {
  logger.info('数据库初始化成功')
  server = app.listen(config.port, () => {
    logger.info(`服务器运行在 http://localhost:${config.port}`)
  })
}).catch(err => {
  logger.error('数据库初始化失败', { error: err.message })
  process.exit(1)
})

function shutdown(signal) {
  logger.info(`收到 ${signal} 信号，开始优雅关闭服务`)
  const done = () => {
    db.close(() => process.exit(0))
  }
  if (server) {
    server.close(done)
    setTimeout(done, 10000).unref()
  } else {
    done()
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝', { error: reason instanceof Error ? reason.message : String(reason) })
})

module.exports = app
