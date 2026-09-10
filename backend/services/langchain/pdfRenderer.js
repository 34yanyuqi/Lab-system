/**
 * PDF 页面渲染服务（多模态识图）
 *
 * 把 PDF 的每一页渲染成 JPEG 图片，直接交给多模态视觉模型（如 deepseek-v4-flash-vision-exp）解析，
 * 取代传统的"先提取纯文本再发送"的方案。相比文本提取：
 *   - 保留排版、表格、图表、流程图、公式、图片、手写批注等纯文本无法表达的信息
 *   - 扫描件 / 图片型 PDF 同样能正确识别（文本提取对这类文件几乎完全失效）
 *
 * 实现：pdfjs-dist（纯 JS 解析，无需外部二进制）
 *     + @napi-rs/canvas（预编译原生画布，无需本机编译工具链）
 * 两者均已在 package.json 依赖中，无需额外安装 Ghostscript / ImageMagick。
 *
 * 渲染结果按 「绝对路径 + mtime + 尺寸 + 渲染参数」 做键进行内存 + 磁盘两级缓存，
 * 避免同一份 PDF 在每轮对话中被反复渲染。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const config = require('../../config')

const BACKEND_DIR = path.dirname(path.dirname(__dirname))
const CACHE_VERSION = 1

// 渲染参数硬上限，作为配置异常时的兜底
const HARD_MAX_PAGES = 200
const MAX_IMAGE_BYTES = 32 * 1024 * 1024 // 单图上限（DeepSeek 文档：base64 单图最大 32 MiB）

let pdfjsPromise = null

// ==================== 配置 ====================

function num(value, fallback) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function visionConfig() {
  const v = (config.ai && config.ai.vision) || {}
  return {
    maxPages: num(v.maxPages, 15),
    maxImages: num(v.maxImages, 30),
    maxLongSide: num(v.maxLongSide, 1600),
    jpegQuality: Math.min(100, Math.max(40, num(v.jpegQuality, 85))),
    detail: v.detail || 'high',
    concurrency: num(v.concurrency, 2),
    cacheEnabled: v.cache !== false,
    cacheDir: v.cacheDir || path.join(BACKEND_DIR, '.cache', 'pdf-render'),
    maxCacheBytes: num(v.maxCacheBytes, 256 * 1024 * 1024),
    maxDiskCacheBytes: num(v.maxDiskCacheBytes, 1024 * 1024 * 1024),
  }
}

function pdfMode() {
  return config.ai && config.ai.pdfMode === 'text' ? 'text' : 'vision'
}

// ==================== 工具 ====================

/** 把 /uploads/xxx.pdf 这类相对路径解析为绝对路径 */
function resolveFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null
  const clean = filePath.replace(/^\/+/, '')
  const abs = path.isAbsolute(clean) ? clean : path.join(BACKEND_DIR, clean)
  return abs
}

function existsFile(abs) {
  try {
    return fs.statSync(abs).isFile()
  } catch {
    return false
  }
}

/** 懒加载 pdfjs（ESM，需动态 import） */
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((err) => {
      pdfjsPromise = null
      throw err
    })
  }
  return pdfjsPromise
}

/** 定位 pdfjs-dist 自带的 cmaps / standard_fonts 目录（存在才传，避免无谓告警） */
let pdfjsResourceDirs = null
function getPdfjsResourceDirs() {
  if (pdfjsResourceDirs) return pdfjsResourceDirs
  pdfjsResourceDirs = { cMapUrl: null, standardFontDataUrl: null }
  try {
    const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
    // pdfjs 把这两个参数当 URL 用：必须是正斜杠且以 '/' 结尾，
    // 否则会抛出 "Invalid factory url ... must include trailing slash"，
    // 在 Windows 上会直接把整个渲染搞挂（path.sep 是反斜杠）。
    const toResourceUrl = (dir) => dir.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
    const cmaps = path.join(root, 'cmaps')
    const fonts = path.join(root, 'standard_fonts')
    if (fs.existsSync(cmaps)) pdfjsResourceDirs.cMapUrl = toResourceUrl(cmaps)
    if (fs.existsSync(fonts)) pdfjsResourceDirs.standardFontDataUrl = toResourceUrl(fonts)
  } catch { /* 忽略：资源目录缺失不影响内嵌字体的 PDF */ }
  return pdfjsResourceDirs
}

// ==================== 并发闸门 ====================
// 渲染是 CPU 密集型操作，限制同时进行的文档渲染数量。

let activeRenders = 0
const renderQueue = []

function acquireSlot() {
  const limit = visionConfig().concurrency
  return new Promise((resolve) => {
    const tryRun = () => {
      activeRenders += 1
      resolve(() => {
        activeRenders -= 1
        while (activeRenders < visionConfig().concurrency && renderQueue.length > 0) {
          renderQueue.shift()()
        }
      })
    }
    if (activeRenders < limit) tryRun()
    else renderQueue.push(tryRun)
  })
}

// ==================== 内存缓存 ====================

const memoryCache = new Map() // cacheKey -> { result, bytes }
let memoryCacheBytes = 0

function memoryGet(key) {
  const hit = memoryCache.get(key)
  if (!hit) return null
  // LRU：命中后移到末尾
  memoryCache.delete(key)
  memoryCache.set(key, hit)
  return hit.result
}

function memorySet(key, result) {
  const bytes = result.images.reduce((sum, img) => sum + img.buffer.length, 0)
  const maxBytes = visionConfig().maxCacheBytes
  if (bytes > maxBytes) return
  memoryCache.set(key, { result, bytes })
  memoryCacheBytes += bytes
  while (memoryCacheBytes > maxBytes && memoryCache.size > 1) {
    const oldestKey = memoryCache.keys().next().value
    const evicted = memoryCache.get(oldestKey)
    memoryCache.delete(oldestKey)
    memoryCacheBytes -= evicted.bytes
  }
}

// 同一份 PDF 的并发渲染请求合并，避免重复计算
const inflight = new Map()

// ==================== 磁盘缓存 ====================

function makeCacheKey(absPath, stat, opts) {
  const raw = [
    CACHE_VERSION,
    absPath,
    stat.mtimeMs,
    stat.size,
    opts.maxPages,
    opts.maxLongSide,
    opts.jpegQuality,
  ].join('|')
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 20)
}

function readDiskCache(cacheKey, opts) {
  if (!opts.cacheEnabled) return null
  const dir = path.join(opts.cacheDir, cacheKey)
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    if (!meta || meta.version !== CACHE_VERSION || !Array.isArray(meta.pages)) return null

    const images = []
    for (const page of meta.pages) {
      const buffer = fs.readFileSync(path.join(dir, `page-${page.pageNumber}.jpg`))
      images.push({
        pageNumber: page.pageNumber,
        buffer,
        width: page.width,
        height: page.height,
        mimeType: 'image/jpeg',
        base64: buffer.toString('base64'),
      })
    }
    if (images.length === 0) return null

    return {
      images,
      pageCount: meta.pageCount,
      renderedPages: images.length,
      fromCache: true,
    }
  } catch {
    return null
  }
}

function writeDiskCache(cacheKey, opts, result) {
  if (!opts.cacheEnabled) return
  const dir = path.join(opts.cacheDir, cacheKey)
  const tmpDir = `${dir}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    for (const img of result.images) {
      fs.writeFileSync(path.join(tmpDir, `page-${img.pageNumber}.jpg`), img.buffer)
    }
    fs.writeFileSync(path.join(tmpDir, 'meta.json'), JSON.stringify({
      version: CACHE_VERSION,
      pageCount: result.pageCount,
      pages: result.images.map((img) => ({
        pageNumber: img.pageNumber,
        width: img.width,
        height: img.height,
      })),
      createdAt: new Date().toISOString(),
    }))
    // 先写临时目录再改名，避免并发读到半成品
    try {
      fs.renameSync(tmpDir, dir)
    } catch {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
    pruneDiskCache(opts)
  } catch (err) {
    console.warn('[pdfRenderer] 写入渲染缓存失败:', err.message)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ==================== 磁盘缓存淘汰 ====================
// 渲染缓存按 文件+mtime+参数 作键，上传后的附件不会变化，因此缓存只增不减。
// 这里在写入后（最多每分钟一次）做一次容量控制，避免长期运行把磁盘吃满。

let lastPruneAt = 0
const PRUNE_INTERVAL_MS = 60 * 1000
const STALE_TMP_MS = 60 * 60 * 1000

function dirSize(dir) {
  let total = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    try {
      if (entry.isDirectory()) total += dirSize(full)
      else total += fs.statSync(full).size
    } catch { /* 文件可能已被并发删除 */ }
  }
  return total
}

function pruneDiskCache(opts) {
  const now = Date.now()
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return
  lastPruneAt = now

  let entries
  try {
    entries = fs.readdirSync(opts.cacheDir, { withFileTypes: true })
  } catch {
    return
  }

  const dirs = []
  for (const entry of entries) {
    const full = path.join(opts.cacheDir, entry.name)
    let stat
    try { stat = fs.statSync(full) } catch { continue }

    // 清理上次异常中断留下的临时目录
    if (entry.name.includes('.tmp-')) {
      if (now - stat.mtimeMs > STALE_TMP_MS) {
        try { fs.rmSync(full, { recursive: true, force: true }) } catch { /* ignore */ }
      }
      continue
    }
    if (entry.isDirectory()) dirs.push({ full, mtimeMs: stat.mtimeMs, size: dirSize(full) })
  }

  // 兜底：上限缺失时按默认值处理，避免把缓存整个删掉
  const limit = num(opts.maxDiskCacheBytes, 1024 * 1024 * 1024)

  let total = dirs.reduce((sum, d) => sum + d.size, 0)
  if (process.env.AI_VISION_DEBUG_CACHE === '1') {
    console.log('[prune] limit=' + limit + ' total=' + total + ' dirs=' + JSON.stringify(dirs.map(d => ({ s: d.size, m: d.mtimeMs }))))
  }
  if (total <= limit) return

  // 最旧的先删（按写入时间；上传后的附件不会变化，因此缓存条目天然按需保留）
  dirs.sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const d of dirs) {
    if (total <= limit) break
    try {
      fs.rmSync(d.full, { recursive: true, force: true })
      total -= d.size
    } catch { /* ignore */ }
  }
}

// ==================== 渲染 ====================

function emptyResult(reason, pageCount = 0) {
  return { images: [], pageCount, renderedPages: 0, fromCache: false, error: reason }
}

/**
 * 渲染 PDF 的每一页为 JPEG 图片
 * @param {string} filePath - PDF 路径（相对 backend 目录或绝对路径）
 * @param {{maxPages?: number, maxLongSide?: number, jpegQuality?: number}} [options]
 * @returns {Promise<{images: Array<{pageNumber:number,buffer:Buffer,base64:string,width:number,height:number,mimeType:string}>, pageCount:number, renderedPages:number, fromCache:boolean, error?:string}>}
 */
async function renderPdfToImages(filePath, options = {}) {
  const absPath = resolveFilePath(filePath)
  if (!absPath) return emptyResult('文件路径无效')
  if (!existsFile(absPath)) return emptyResult('文件不存在')

  let stat
  try {
    stat = fs.statSync(absPath)
  } catch (err) {
    return emptyResult('无法读取文件信息: ' + err.message)
  }

  const base = visionConfig()
  const opts = {
    maxPages: num(options.maxPages, base.maxPages),
    maxLongSide: num(options.maxLongSide, base.maxLongSide),
    jpegQuality: Math.min(100, Math.max(40, num(options.jpegQuality, base.jpegQuality))),
    cacheEnabled: base.cacheEnabled,
    cacheDir: base.cacheDir,
    maxDiskCacheBytes: base.maxDiskCacheBytes,
  }
  opts.maxPages = Math.min(opts.maxPages, HARD_MAX_PAGES)

  const cacheKey = makeCacheKey(absPath, stat, opts)

  const memHit = memoryGet(cacheKey)
  if (memHit) return { ...memHit, fromCache: true }

  const pending = inflight.get(cacheKey)
  if (pending) return pending

  const task = (async () => {
    const diskHit = readDiskCache(cacheKey, opts)
    if (diskHit) {
      memorySet(cacheKey, diskHit)
      return diskHit
    }

    const result = await doRender(absPath, opts)
    if (result.images.length > 0) {
      memorySet(cacheKey, result)
      writeDiskCache(cacheKey, opts, result)
    }
    return result
  })().finally(() => inflight.delete(cacheKey))

  inflight.set(cacheKey, task)
  return task
}

async function doRender(absPath, opts) {
  const release = await acquireSlot()
  let loadingTask = null
  try {
    const pdfjs = await getPdfjs()
    const { createCanvas } = require('@napi-rs/canvas')
    const { cMapUrl, standardFontDataUrl } = getPdfjsResourceDirs()

    const data = new Uint8Array(fs.readFileSync(absPath))
    const params = {
      data,
      isEvalSupported: false,
      useWorkerFetch: false,
      disableFontFace: true,   // Node 环境没有 DOM 字体，必须关闭
      useSystemFonts: false,
      verbosity: 0,
    }
    if (cMapUrl) params.cMapUrl = cMapUrl
    if (standardFontDataUrl) params.standardFontDataUrl = standardFontDataUrl

    loadingTask = pdfjs.getDocument(params)
    const doc = await loadingTask.promise

    const pageCount = doc.numPages || 0
    const limit = Math.min(pageCount, opts.maxPages)
    const images = []

    for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      try {
        const baseViewport = page.getViewport({ scale: 1 })
        const longest = Math.max(baseViewport.width, baseViewport.height)
        const scale = longest > 0 ? opts.maxLongSide / longest : 1

        const viewport = page.getViewport({ scale })
        const width = Math.max(1, Math.ceil(viewport.width))
        const height = Math.max(1, Math.ceil(viewport.height))

        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d')
        // PDF 页面本身不带底色，先铺白避免透明区域在 JPEG 里变黑
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)

        await page.render({ canvasContext: ctx, viewport, canvas }).promise

        const buffer = canvas.toBuffer('image/jpeg', opts.jpegQuality)
        if (buffer.length > MAX_IMAGE_BYTES) {
          console.warn(`[pdfRenderer] 第 ${pageNumber} 页图片过大（${(buffer.length / 1048576).toFixed(1)}MB），已跳过`)
          continue
        }

        images.push({
          pageNumber,
          buffer,
          base64: buffer.toString('base64'),
          width,
          height,
          mimeType: 'image/jpeg',
        })
      } finally {
        if (typeof page.cleanup === 'function') page.cleanup()
      }
    }

    return {
      images,
      pageCount,
      renderedPages: images.length,
      fromCache: false,
      truncated: limit < pageCount,
    }
  } catch (err) {
    console.error('[pdfRenderer] 渲染 PDF 失败:', err.message)
    return emptyResult('渲染失败: ' + err.message)
  } finally {
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      try { await loadingTask.destroy() } catch { /* ignore */ }
    }
    release()
  }
}

// ==================== 图片内容块 ====================

/**
 * 把渲染结果转换为 OpenAI 兼容的图片内容块（仅可用于 user 消息，
 * system / assistant 消息携带图片会被 DeepSeek 返回 400）
 * @param {Array} images - renderPdfToImages 返回的 images
 * @param {string} [detail] - low | high | original | auto
 */
function toImageContentBlocks(images, detail) {
  const level = detail || visionConfig().detail
  return (images || []).map((img) => ({
    type: 'image_url',
    image_url: {
      url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64 || img.buffer.toString('base64')}`,
      detail: level,
    },
  }))
}

/** 直接读取一个图片文件（png/jpg/webp/gif）为可复用的图片描述对象 */
function readImageFile(filePath) {
  const absPath = resolveFilePath(filePath)
  if (!absPath || !existsFile(absPath)) return null

  const ext = path.extname(absPath).toLowerCase()
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  const mimeType = mimeMap[ext]
  if (!mimeType) return null

  try {
    const buffer = fs.readFileSync(absPath)
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null
    return {
      pageNumber: 1,
      buffer,
      base64: buffer.toString('base64'),
      mimeType,
      width: 0,
      height: 0,
    }
  } catch {
    return null
  }
}

module.exports = {
  renderPdfToImages,
  toImageContentBlocks,
  readImageFile,
  visionConfig,
  pdfMode,
  resolveFilePath,
}
