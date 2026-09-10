/**
 * LangChain 服务层统一导出
 */
const { getChatModel, getStreamingModel, getVisionModel } = require('./llm')
const { loadPdfDocuments } = require('./pdfLoader')
const {
  renderPdfToImages,
  toImageContentBlocks,
  readImageFile,
  visionConfig,
  pdfMode
} = require('./pdfRenderer')
const { loadSubmissionAttachment } = require('./attachmentLoader')
const { getTextSplitter } = require('./textSplitter')
const { buildSystemPrompt, createChatPromptTemplate } = require('./prompts/chatPrompt')
const { buildAnalysisPrompt, createAnalysisPromptTemplate } = require('./prompts/analysisPrompt')
const { createChatMemory, dbMessagesToHistory, historyToDbMessages } = require('./memory')
const { chat, chatStream, createChatChain } = require('./chains/chatChain')
const { analyzeProgress, analyzeProgressStream, createAnalysisChain } = require('./chains/analysisChain')

module.exports = {
  // LLM
  getChatModel,
  getStreamingModel,
  getVisionModel,
  // PDF
  loadPdfDocuments,
  // PDF -> 图片（多模态识图）
  renderPdfToImages,
  toImageContentBlocks,
  readImageFile,
  visionConfig,
  pdfMode,
  // 附件 -> 模型上下文
  loadSubmissionAttachment,
  // Text Splitter
  getTextSplitter,
  // Prompts
  buildSystemPrompt,
  createChatPromptTemplate,
  buildAnalysisPrompt,
  createAnalysisPromptTemplate,
  // Memory
  createChatMemory,
  dbMessagesToHistory,
  historyToDbMessages,
  // Chains
  chat,
  chatStream,
  createChatChain,
  analyzeProgress,
  analyzeProgressStream,
  createAnalysisChain
}
