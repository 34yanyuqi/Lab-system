/**
 * LLM 工厂模块
 * 统一创建和管理 ChatOpenAI 实例
 */
const { ChatOpenAI } = require('@langchain/openai')
const config = require('../../config')

function getChatModel(options = {}) {
  const apiKey = options.apiKey || config.ai?.apiKey || process.env.AI_API_KEY || ''
  const baseURL = options.baseURL || config.ai?.apiBase || process.env.AI_API_BASE || 'https://api.openai.com/v1'
  const model = options.model || config.ai?.model || process.env.AI_MODEL || 'gpt-4o-mini'
  const temperature = options.temperature !== undefined
    ? options.temperature
    : ((config.ai?.temperature ?? parseFloat(process.env.AI_TEMPERATURE)) || 0.7)
  const maxTokens = options.maxTokens || config.ai?.maxTokens || parseInt(process.env.AI_MAX_TOKENS) || 4096

  return new ChatOpenAI({
    apiKey,
    configuration: { baseURL },
    model,
    temperature,
    maxTokens,
    streaming: true
  })
}

function getStreamingModel(options = {}) {
  return getChatModel({ ...options, streaming: true })
}

/**
 * 创建多模态视觉模型实例
 * 用于附件以「页面图片」形式送入时（图片只能出现在 user 消息中）
 *
 * 模型选择优先级：
 *   1. 调用方显式指定
 *   2. AI_VISION_MODEL —— 显式配置的识图模型
 *   3. AI_MODEL       —— 很多主模型本身就支持图片输入（例如 deepseek-v4-flash）
 *   4. 兜底默认值
 *
 * 之所以优先复用 AI_MODEL 而不是写死某个视觉模型名：换到其他 OpenAI 兼容
 * 服务（或主模型升级为多模态）时，不会因为硬编码专有模型名而失效。
 */
function getVisionModel(options = {}) {
  const model = options.model
    || process.env.AI_VISION_MODEL
    || config.ai?.model
    || config.ai?.visionModel
    || 'deepseek-v4-flash-vision-exp'
  return getChatModel({ ...options, model })
}

module.exports = { getChatModel, getStreamingModel, getVisionModel }
