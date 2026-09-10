/**
 * 文本分割器配置
 * 使用 @langchain/textsplitters 的 RecursiveCharacterTextSplitter
 */
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters')

/**
 * 获取预配置的文本分割器
 * @param {object} options
 * @param {number} options.chunkSize - 分块大小（默认 1000）
 * @param {number} options.chunkOverlap - 重叠大小（默认 200）
 */
function getTextSplitter(options = {}) {
  const chunkSize = options.chunkSize || 1000
  const chunkOverlap = options.chunkOverlap || 200

  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '。', '！', '？', '；', '，', ' ', '']
  })
}

module.exports = { getTextSplitter }
