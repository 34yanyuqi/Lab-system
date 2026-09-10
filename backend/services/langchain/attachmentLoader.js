/**
 * 提交附件加载器（多模态识图）
 *
 * 把学生提交的附件转换成可直接送给模型的上下文片段：
 *   - PDF：逐页渲染为 JPEG 图片（vision 模式），随 user 消息一起发送
 *   - 图片附件：直接内联
 *   - 以上都不可用时：回退到旧的纯文本提取（text 模式）
 *
 * 之所以单独成模块，是为了让路由层保持轻量，并让这段逻辑可被单独测试。
 */
const path = require('path')
const {
  renderPdfToImages,
  toImageContentBlocks,
  readImageFile,
  visionConfig,
  pdfMode,
} = require('./pdfRenderer')
const { loadPdfDocuments } = require('./pdfLoader')

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i

/**
 * 加载提交附件，构造供多模态模型使用的上下文片段。
 *
 * 优先走「识图」路径：把 PDF 每页渲染成图片，随用户消息一起发送，
 * 让模型直接阅读原始排版（表格 / 图表 / 公式 / 扫描件都能识别）。
 * 渲染失败时自动回退到旧的纯文本提取方式，保证功能不中断。
 *
 * @param {{name: string, url: string}|null} fileInfo - parseStoredFile 的返回值
 * @returns {Promise<object>} 可直接展开进对话 context 的字段
 */
async function loadSubmissionAttachment(fileInfo) {
  const result = {
    pdfMode: pdfMode(),
    pdfFileName: '',
    pdfPageCount: 0,
    pdfRenderedPages: 0,
    pdfImageCount: 0,
    pdfImages: [],
    pdfText: null,
  }

  if (!fileInfo || !fileInfo.url) return result

  result.pdfFileName = fileInfo.name || path.basename(fileInfo.url)
  const lowerUrl = String(fileInfo.url).toLowerCase()

  // 1) 附件本身就是图片（png/jpg/webp/gif）：直接内联发送
  const inlineImage = readImageFile(fileInfo.url)
  if (inlineImage) {
    result.pdfMode = 'vision'
    result.pdfImages = toImageContentBlocks([inlineImage])
    result.pdfImageCount = 1
    result.pdfPageCount = 1
    result.pdfRenderedPages = 1
    return result
  }

  // 非 PDF（zip/rar/7z 等）没有可解析内容，原样返回
  if (!lowerUrl.endsWith('.pdf')) return result

  // 2) 识图模式：渲染 PDF 页面为图片
  if (pdfMode() === 'vision') {
    const cfg = visionConfig()
    const rendered = await renderPdfToImages(fileInfo.url, {
      maxPages: Math.min(cfg.maxPages, cfg.maxImages),
    })

    if (rendered.images.length > 0) {
      result.pdfMode = 'vision'
      result.pdfImages = toImageContentBlocks(rendered.images)
      result.pdfImageCount = rendered.images.length
      result.pdfRenderedPages = rendered.renderedPages
      result.pdfPageCount = rendered.pageCount || rendered.images.length
      console.log(
        'AI对话：' + result.pdfFileName + ' 已渲染 ' + rendered.renderedPages + '/' + result.pdfPageCount + ' 页为图片' +
        (rendered.fromCache ? '（缓存命中）' : '')
      )
      return result
    }

    console.warn('AI对话：PDF 渲染为图片失败，回退文本提取 -', result.pdfFileName, rendered.error || '')
  }

  // 3) 回退：纯文本提取
  const { fullText, pageCount } = await loadPdfDocuments(fileInfo.url)
  result.pdfMode = 'text'
  result.pdfText = fullText || null
  result.pdfPageCount = pageCount || result.pdfPageCount
  return result
}

module.exports = { loadSubmissionAttachment, IMAGE_EXT_RE }