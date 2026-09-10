/**
 * 多周进度分析链
 *
 * 附件以页面图片（vision）或纯文本（text 回退）的形式构建成一条用户消息后流式分析。
 */
const { StringOutputParser } = require('@langchain/core/output_parsers')
const { RunnableSequence, RunnablePassthrough } = require('@langchain/core/runnables')
const { HumanMessage } = require('@langchain/core/messages')
const { getChatModel, getVisionModel } = require('../llm')
const { buildAnalysisPrompt, createAnalysisPromptTemplate } = require('../prompts/analysisPrompt')
const { loadPdfDocuments } = require('../pdfLoader')
const { renderPdfToImages, toImageContentBlocks, visionConfig, pdfMode } = require('../pdfRenderer')

const MAX_SINGLE_PDF_CHARS = 8000  // 单个 PDF 最大字符数（仅 text 回退模式使用）
const MAX_TOTAL_CHARS = 40000      // 所有 PDF 总字符数上限（仅 text 回退模式使用）

/**
 * 创建分析链
 * @param {object} context - { studentName, studentSchoolId, taskTitle, weeks, pdfMode }
 * @param {boolean} hasImages - 是否携带图片（决定使用视觉模型）
 */
function createAnalysisChain(context, hasImages = false) {
  const systemPrompt = buildAnalysisPrompt(context)
  const promptTemplate = createAnalysisPromptTemplate()
  const options = { temperature: 0.5, maxTokens: 4096 }
  const model = hasImages ? getVisionModel(options) : getChatModel(options)
  const parser = new StringOutputParser()

  const chain = RunnableSequence.from([
    {
      system_prompt: () => systemPrompt,
      user_messages: new RunnablePassthrough()
    },
    promptTemplate,
    model,
    parser
  ])

  return chain
}

/**
 * 加载所有 PDF 并构建用户消息内容块
 * @param {Array<{submissionId: number, fileUrl: string, weekNumber: number, fileName: string}>} pdfs
 * @returns {Promise<{message: HumanMessage, hasImages: boolean, weeks: Array}>}
 */
async function buildAnalysisInput(pdfs = []) {
  const mode = pdfMode()
  const { maxImages, maxPages } = visionConfig()

  // 按周次平均分配图片预算，避免前面的周次把额度吃光
  const perPdf = Math.max(1, Math.min(maxPages, Math.floor(maxImages / Math.max(1, pdfs.length))))

  const sections = []
  let totalImages = 0
  let totalChars = 0

  for (const pdf of pdfs) {
    let section = null

    if (mode === 'vision' && totalImages < maxImages) {
      const allowance = Math.min(perPdf, maxImages - totalImages)
      const rendered = await renderPdfToImages(pdf.fileUrl, { maxPages: allowance })

      if (rendered.images.length > 0) {
        section = {
          pdf,
          type: 'vision',
          blocks: toImageContentBlocks(rendered.images),
          pageCount: rendered.pageCount || rendered.images.length,
          imageCount: rendered.images.length,
        }
        totalImages += rendered.images.length
      } else {
        console.warn(`[analysisChain] 第${pdf.weekNumber}周 PDF 渲染失败，回退文本提取：${rendered.error || '未知原因'}`)
      }
    }

    if (!section) {
      const { fullText, pageCount } = await loadPdfDocuments(pdf.fileUrl)
      let content = fullText || '[此附件无法解析，可能是扫描件或加密文件]'
      if (content.length > MAX_SINGLE_PDF_CHARS) {
        content = content.slice(0, MAX_SINGLE_PDF_CHARS) + `\n\n[内容过长，已截取前${MAX_SINGLE_PDF_CHARS}个字符]`
      }
      if (totalChars + content.length > MAX_TOTAL_CHARS) {
        const remaining = MAX_TOTAL_CHARS - totalChars
        content = remaining > 500
          ? content.slice(0, remaining) + '\n\n[内容已截断]'
          : '[内容过多，已省略]'
      }
      totalChars += content.length
      section = {
        pdf,
        type: 'text',
        content,
        pageCount: pageCount || 0,
        imageCount: 0,
      }
    }

    sections.push(section)
  }

  // 把各段（周次标题 + 图片/文本）按顺序拼成一条用户消息
  const content = []
  for (const section of sections) {
    let header = `===== 第${section.pdf.weekNumber}周：${section.pdf.fileName || '附件'}`
    if (section.pageCount) header += `（共 ${section.pageCount} 页）`
    header += ' ====='
    if (section.type === 'vision' && section.imageCount < section.pageCount) {
      header += `\n（以下为该周前 ${section.imageCount} 页的页面图片）`
    } else if (section.type === 'vision') {
      header += `\n（以下为该周全部 ${section.imageCount} 页的页面图片）`
    }
    content.push({ type: 'text', text: header })

    if (section.type === 'vision') {
      content.push(...section.blocks)
    } else {
      content.push({ type: 'text', text: section.content })
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '（没有可分析的附件内容）' })
  }

  return {
    message: new HumanMessage({ content }),
    hasImages: sections.some((s) => s.type === 'vision'),
    sections,
    weeks: sections.map((s) => ({
      weekNumber: s.pdf.weekNumber,
      fileName: s.pdf.fileName,
      submitTime: s.pdf.submitTime,
      pageCount: s.pageCount,
      imageCount: s.imageCount,
    })),
  }
}

/**
 * 流式进度分析生成器
 * @param {object} context - { studentName, studentSchoolId, taskTitle, weeks }
 * @param {Array<{submissionId: number, fileUrl: string, weekNumber: number, fileName: string, submitTime: string}>} pdfs - 要分析的 PDF 列表
 */
async function* analyzeProgressStream(context, pdfs = []) {
  const { message, hasImages, weeks } = await buildAnalysisInput(pdfs)

  const enrichedContext = { ...context, weeks, pdfMode: hasImages ? 'vision' : 'text' }
  const chain = createAnalysisChain(enrichedContext, hasImages)

  const stream = await chain.stream([message])
  for await (const chunk of stream) {
    yield chunk
  }
}

/**
 * 非流式进度分析
 */
async function analyzeProgress(context, pdfs = []) {
  const { message, hasImages, weeks } = await buildAnalysisInput(pdfs)

  const enrichedContext = { ...context, weeks, pdfMode: hasImages ? 'vision' : 'text' }
  const chain = createAnalysisChain(enrichedContext, hasImages)

  return await chain.invoke([message])
}

module.exports = { createAnalysisChain, analyzeProgress, analyzeProgressStream, buildAnalysisInput }
