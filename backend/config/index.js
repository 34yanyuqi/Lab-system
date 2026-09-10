const path = require('path')
// 显式指定 .env 路径，避免以其他工作目录启动时静默回退到默认配置
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const nodeEnv = process.env.NODE_ENV || 'development'
const isProduction = nodeEnv === 'production'

const INSECURE_JWT_SECRETS = new Set([
  '',
  'default-secret-key',
  'secret',
  'your-super-secret-jwt-key-change-in-production'
])

const jwtSecret = process.env.JWT_SECRET || 'default-secret-key'

if (INSECURE_JWT_SECRETS.has(jwtSecret)) {
  if (isProduction) {
    throw new Error(
      '生产环境拒绝启动：必须在 .env 中配置安全的 JWT_SECRET（建议 32 位以上随机字符串）'
    )
  }
  console.warn('[config] 警告：正在使用不安全的默认 JWT_SECRET，请勿用于生产环境')
}

if (isProduction && jwtSecret.length < 32) {
  throw new Error('生产环境拒绝启动：JWT_SECRET 长度必须不少于 32 个字符')
}

function intEnv(value, fallback) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function floatEnv(value, fallback) {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

module.exports = {
  port: intEnv(process.env.PORT, 3000),
  nodeEnv,
  isProduction,
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  db: {
    path: process.env.DB_PATH || './stutaskcheck.db'
  },
  cors: {
    // 生产环境必须显式配置来源，禁止使用通配符
    origin: process.env.CORS_ORIGIN || (isProduction ? false : '*')
  },
  upload: {
    maxFileSize: intEnv(process.env.MAX_FILE_SIZE, 52428800),
    path: process.env.UPLOAD_PATH || './uploads'
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: intEnv(process.env.SMTP_PORT, 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || ''
      }
    },
    // 仅在明确配置时跳过证书校验，默认开启校验
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    from: process.env.EMAIL_FROM || 'noreply@example.com',
    activationLinkPrefix: process.env.ACTIVATION_LINK_PREFIX || 'http://localhost:3000/'
  },
  frontendPath: process.env.FRONTEND_PATH || path.resolve(__dirname, '../../frontend/dist'),
  attendance: {
    morningOnDeadline: process.env.ATTENDANCE_MORNING_ON_DEADLINE || '09:10',
    morningOffEarliest: process.env.ATTENDANCE_MORNING_OFF_EARLIEST || '11:30',
    afternoonOnDeadline: process.env.ATTENDANCE_AFTERNOON_ON_DEADLINE || '14:10',
    afternoonOffEarliest: process.env.ATTENDANCE_AFTERNOON_OFF_EARLIEST || '17:30',
  },
  ai: {
    apiKey: process.env.AI_API_KEY || '',
    apiBase: process.env.AI_API_BASE || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    temperature: floatEnv(process.env.AI_TEMPERATURE, 0.7),
    maxTokens: intEnv(process.env.AI_MAX_TOKENS, 4096),
    systemPrompt: process.env.AI_SYSTEM_PROMPT || '',
    analysisPrompt: process.env.AI_ANALYSIS_PROMPT || '',
    // 多模态视觉模型：附件以页面图片形式直接交给该模型解析。
    // 未显式配置时留空，由 llm.getVisionModel() 回退到 AI_MODEL。
    visionModel: process.env.AI_VISION_MODEL || '',
    // PDF 处理模式：vision = 渲染为图片交给视觉模型；text = 旧的纯文本提取方式
    pdfMode: process.env.AI_PDF_MODE === 'text' ? 'text' : 'vision',
    vision: {
      // 单个 PDF 最多渲染的页数
      maxPages: intEnv(process.env.AI_VISION_MAX_PAGES, 15),
      // 单次请求最多携带的图片总数（多周分析时按周分配）
      maxImages: intEnv(process.env.AI_VISION_MAX_IMAGES, 30),
      // 渲染长边像素。模型端最终会缩放到约 800×800 等效像素，
      // 这里渲染到 ~2 倍分辨率可让缩小后的文字更清晰
      maxLongSide: intEnv(process.env.AI_VISION_MAX_EDGE, 1600),
      // JPEG 质量
      jpegQuality: intEnv(process.env.AI_VISION_JPEG_QUALITY, 85),
      // 图片细节级别：low | high | original | auto（high 等价于 original）
      detail: process.env.AI_VISION_DETAIL || 'high',
      // 并发渲染数，避免多请求同时渲染把 CPU 打满
      concurrency: intEnv(process.env.AI_VISION_CONCURRENCY, 2),
      // 是否启用渲染缓存（按 文件路径+mtime+渲染参数 做键）
      cache: process.env.AI_VISION_CACHE !== 'false',
      cacheDir: process.env.AI_VISION_CACHE_DIR || '',
      // 内存缓存上限
      maxCacheBytes: intEnv(process.env.AI_VISION_MAX_CACHE_MB, 256) * 1024 * 1024,
      // 磁盘缓存上限（超出后按最久未访问淘汰）
      maxDiskCacheBytes: intEnv(process.env.AI_VISION_MAX_DISK_CACHE_MB, 1024) * 1024 * 1024,
    },
  }
}
