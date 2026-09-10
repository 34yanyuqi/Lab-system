/**
 * 对话记忆管理
 * 基于 BufferWindowMemory 模式的简单实现
 * 结合数据库持久化
 */
const { AIMessage, HumanMessage, SystemMessage } = require('@langchain/core/messages')

/**
 * 创建对话记忆实例（简化的 BufferWindowMemory）
 * @param {object} options
 * @param {number} options.k - 保留最近 k 轮对话（默认 10）
 */
function createChatMemory(options = {}) {
  const k = options.k || 10
  const messages = []

  return {
    getMessages() {
      return messages.slice(-k * 2) // k 轮 = k*2 条消息（用户+AI）
    },
    addUserMessage(content) {
      messages.push(new HumanMessage(content))
    },
    addAIMessage(content) {
      messages.push(new AIMessage(content))
    },
    clear() {
      messages.length = 0
    }
  }
}

/**
 * 将数据库中的消息记录转换为 LangChain 消息格式
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array<import('@langchain/core/messages').BaseMessage>}
 */
function dbMessagesToHistory(messages) {
  if (!Array.isArray(messages)) return []
  const recent = messages.slice(-20) // 最多保留最近 20 条
  return recent.map(m => {
    if (m.role === 'user') return new HumanMessage(m.content)
    if (m.role === 'assistant' || m.role === 'ai') return new AIMessage(m.content)
    return new HumanMessage(m.content)
  })
}

/**
 * 将 LangChain 消息格式转换为数据库存储格式
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
function historyToDbMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.map(m => ({
    role: m.role === 'ai' ? 'assistant' : m.role,
    content: m.content
  }))
}

module.exports = { createChatMemory, dbMessagesToHistory, historyToDbMessages }
