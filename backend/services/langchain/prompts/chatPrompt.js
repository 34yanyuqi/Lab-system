/**
 * 单提交对话系统提示词模板
 */
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts')
const config = require('../../../config')

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function buildContextString(context) {
  const {
    studentName, studentSchoolId, studentGrade, studentMajor,
    taskTitle, taskType, taskContent,
    submitContent, submitTime, checkStatus, checkRemark,
    pdfText, pdfMode, pdfFileName, pdfPageCount,
    pdfRenderedPages, pdfImageCount
  } = context

  let block = '\n\n---\n## 当前审核上下文\n'
  block += `\n### 学生信息\n- 姓名：${studentName || '未知'}\n- 学号：${studentSchoolId || '未知'}\n- 年级：${studentGrade || '未知'}\n- 专业：${studentMajor || '未知'}`
  block += `\n\n### 任务信息\n- 任务标题：${taskTitle || '未知'}\n- 任务类型：${taskType || '未知'}`

  if (taskContent) {
    const plain = stripHtml(taskContent)
    block += plain.length > 2000
      ? `\n- 任务内容摘要：${plain.slice(0, 2000)}...`
      : `\n- 任务内容：${plain}`
  }

  block += `\n\n### 学生提交信息\n- 提交时间：${submitTime || '未知'}\n- 审核状态：${checkStatus || '待审核'}`
  if (checkRemark) block += `\n- 已有评语：${checkRemark}`

  if (submitContent) {
    const plain = stripHtml(submitContent)
    block += plain.length > 5000
      ? `\n\n提交内容摘要：${plain.slice(0, 5000)}...\n[提交内容过长，已截取前5000字符]`
      : `\n\n提交内容：\n${plain}`
  }

  if (pdfMode === 'vision') {
    // 识图模式：附件以页面图片的形式随本条用户消息传入，这里只做说明
    const imageCount = Number(pdfImageCount) || 0
    const totalPages = Number(pdfPageCount) || 0

    if (imageCount > 0) {
      const rendered = Number(pdfRenderedPages) || imageCount
      block += '\n\n### 提交附件（已转为页面图片）'
      block += `\n- 文件名：${pdfFileName || '未命名附件'}`
      if (totalPages > 0) block += `\n- 文档总页数：${totalPages} 页`
      block += `\n- 随本条消息附带的页面图片：${imageCount} 张（第 1 至第 ${rendered} 页）`
      if (totalPages > rendered) {
        block += `\n- 注意：仅提供了前 ${rendered} 页的图片，第 ${rendered + 1} 页及之后的内容不可见，请勿臆测。`
      }
      block += '\n- 图片即为学生提交的原始内容，请直接阅读图片（包括正文、表格、图表、流程图、公式、图片与手写批注）。'
      block += '\n- 需要引用原文时，请以图片中实际可见的文字为准，不要编造页码或内容。'
    } else {
      block += '\n\n### 提交附件\n[附件无法转为图片，且没有可用的文本内容（可能是加密文件或已损坏）]'
    }
  } else if (pdfText) {
    block += `\n\n### PDF附件内容\n${pdfText}`
  } else {
    block += '\n\n### PDF附件内容\n[无PDF文件或PDF无法解析（可能是扫描件/加密文件）]'
  }

  block += '\n\n---\n请基于以上上下文信息回答教师的问题，给出专业、建设性的意见。'
  return block
}

function buildSystemPrompt(context) {
  const basePrompt = config.ai?.systemPrompt
    || process.env.AI_SYSTEM_PROMPT
    || '你是一个专业的教育审核助手，帮助教师审核学生的任务提交报告。请根据学生的提交内容给出客观、专业的分析和建议。回答时使用中文。'

  const contextBlock = buildContextString(context)
  return basePrompt + contextBlock
}

/**
 * 创建对话提示词模板
 *
 * 用户消息使用 MessagesPlaceholder 而非字符串占位符，
 * 这样可以直接传入 HumanMessage（content 为多模态内容块数组），
 * 从而把 PDF 页面图片随用户消息一起发给视觉模型
 * （DeepSeek 仅允许图片出现在 user 消息中）。
 *
 * @returns {ChatPromptTemplate}
 */
function createChatPromptTemplate() {
  return ChatPromptTemplate.fromMessages([
    ['system', '{system_prompt}'],
    new MessagesPlaceholder('history'),
    new MessagesPlaceholder('user_messages')
  ])
}

module.exports = { buildSystemPrompt, buildContextString, createChatPromptTemplate, stripHtml }
