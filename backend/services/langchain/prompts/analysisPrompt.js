/**
 * 多周进度分析提示词模板
 */
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts')
const config = require('../../../config')

/**
 * 构建分析系统提示词
 * @param {object} context
 * @param {string} context.studentName - 学生姓名
 * @param {string} context.studentSchoolId - 学号
 * @param {string} context.taskTitle - 任务标题
 * @param {string} [context.pdfMode] - vision | text
 * @param {Array<{weekNumber: number, submitTime: string, fileName: string, pageCount?: number, imageCount?: number}>} context.weeks - 周次信息
 */
function buildAnalysisPrompt(context) {
  const {
    studentName, studentSchoolId, taskTitle, weeks = [], pdfMode
  } = context

  const isVision = pdfMode === 'vision'

  const basePrompt = config.ai?.analysisPrompt
    || process.env.AI_ANALYSIS_PROMPT
    || `你是一个专业的教育评估专家，擅长分析学生的学术进展和成长轨迹。
请根据学生多个周次的提交内容，进行全面的进度对比分析。回答时使用中文，采用结构化格式。`

  let block = '\n\n---\n## 分析任务\n'

  block += `\n### 学生信息\n- 姓名：${studentName || '未知'}\n- 学号：${studentSchoolId || '未知'}`
  block += `\n\n### 任务信息\n- 任务标题：${taskTitle || '未知'}`

  block += '\n\n### 分析周次\n'
  weeks.forEach(w => {
    let line = `- 第${w.weekNumber}周：${w.fileName || '附件'}（提交时间：${w.submitTime || '未知'}`
    if (w.pageCount) line += `，共 ${w.pageCount} 页`
    if (isVision) {
      line += `，已附带 ${w.imageCount || 0} 张页面图片`
      if (w.pageCount && w.imageCount && w.imageCount < w.pageCount) {
        line += `（仅前 ${w.imageCount} 页，其余内容不可见）`
      }
    }
    block += line + '）\n'
  })

  block += `\n共 ${weeks.length} 个周次的提交需要对比分析。`

  block += `\n\n---\n## 分析要求

请按以下结构输出分析结果：

### 1. 各周内容摘要
对每个周次的提交内容进行简要概括（2-3句话）。

### 2. 进度对比分析
- 内容完整度的变化趋势
- 研究深度的提升情况
- 方法论或技术栈的演进

### 3. 能力提升点
指出学生在哪些方面表现出明显的进步。

### 4. 存在的问题
指出当前仍存在的不足或需要改进的地方。

### 5. 总体评价与建议
给出综合性的评价和后续学习的建议。

---`

  if (isVision) {
    block += `

以下按周次依次附带各周 PDF 的页面图片，每段图片上方有文字标明该段属于哪一周、共几页。
请直接阅读这些页面图片（包括正文、表格、图表、流程图与公式）后进行分析。
若某一周的图片页数少于该周总页数，请只基于可见页作答，不要臆测未提供的内容。`
  } else {
    block += `

以下是各周次PDF文件的内容：`
  }

  return basePrompt + block
}

/**
 * 创建分析提示词模板
 *
 * 用户消息使用 MessagesPlaceholder，以便传入携带图片内容块的 HumanMessage。
 *
 * @returns {ChatPromptTemplate}
 */
function createAnalysisPromptTemplate() {
  return ChatPromptTemplate.fromMessages([
    ['system', '{system_prompt}'],
    new MessagesPlaceholder('user_messages')
  ])
}

module.exports = { buildAnalysisPrompt, createAnalysisPromptTemplate }
