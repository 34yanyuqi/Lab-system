/**
 * 单提交对话链
 * 使用 LCEL 构建，集成对话记忆和流式输出
 *
 * 附件支持两种模式：
 *   - vision：把 PDF 页面渲染成图片，作为多模态内容块随用户消息发送
 *   - text  ：沿用旧的纯文本提取方式，把文本拼进系统提示词
 */
const { StringOutputParser } = require('@langchain/core/output_parsers')
const { RunnableSequence, RunnablePassthrough } = require('@langchain/core/runnables')
const { HumanMessage } = require('@langchain/core/messages')
const { getChatModel, getVisionModel } = require('../llm')
const { createChatPromptTemplate, buildSystemPrompt } = require('../prompts/chatPrompt')
const { createChatMemory, dbMessagesToHistory } = require('../memory')

/**
 * 取出一条消息的纯文本内容（历史消息可能是字符串或多模态块数组）
 */
function messageText(message) {
  if (!message) return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
  }
  return content == null ? '' : String(content)
}

/**
 * 构建本条用户消息：文本 + （可选）附件页面图片
 * 图片必须挂在 user 消息上，DeepSeek 对视图片的 system / assistant 消息会返回 400
 * @param {Array<{role:string, content:any}>} messages
 * @param {object} context
 * @returns {HumanMessage}
 */
function buildUserMessage(messages = [], context = {}) {
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const text = messageText(lastMessage).trim()

  const imageBlocks = Array.isArray(context.pdfImages) ? context.pdfImages : []
  if (imageBlocks.length === 0) {
    return new HumanMessage(text)
  }

  const blocks = [
    { type: 'text', text: text || '请阅读本条消息附带的附件页面图片，并给出你的分析。' },
    ...imageBlocks,
  ]
  return new HumanMessage({ content: blocks })
}

/**
 * 创建对话链
 * @param {object} context - 提交上下文信息（含 pdfImages 时自动切换到视觉模型）
 * @param {Array<{role: string, content: string}>} historyMessages - 历史消息
 */
function createChatChain(context, historyMessages = []) {
  const systemPrompt = buildSystemPrompt(context)
  const promptTemplate = createChatPromptTemplate()

  const hasImages = Array.isArray(context.pdfImages) && context.pdfImages.length > 0
  const model = hasImages ? getVisionModel() : getChatModel()
  const parser = new StringOutputParser()

  const chain = RunnableSequence.from([
    {
      system_prompt: () => systemPrompt,
      history: () => dbMessagesToHistory(historyMessages),
      user_messages: new RunnablePassthrough()
    },
    promptTemplate,
    model,
    parser
  ])

  return chain
}

/**
 * 创建流式对话生成器
 * @param {object} context
 * @param {Array<{role: string, content: string}>} messages - 当前对话消息列表
 * @param {Array<{role: string, content: string}>} historyMessages - 历史消息
 */
async function* chatStream(context, messages, historyMessages = []) {
  const chain = createChatChain(context, historyMessages)
  const userMessage = buildUserMessage(messages, context)

  const stream = await chain.stream([userMessage])

  for await (const chunk of stream) {
    yield chunk
  }
}

/**
 * 非流式对话
 * @param {object} context
 * @param {Array<{role: string, content: string}>} messages
 * @param {Array<{role: string, content: string}>} historyMessages
 * @returns {Promise<string>}
 */
async function chat(context, messages, historyMessages = []) {
  const chain = createChatChain(context, historyMessages)
  const userMessage = buildUserMessage(messages, context)
  const result = await chain.invoke([userMessage])
  return result
}

module.exports = { createChatChain, chat, chatStream, buildUserMessage }
