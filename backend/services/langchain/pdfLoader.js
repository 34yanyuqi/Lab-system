/**
 * PDF 文档加载器
 * 使用 @langchain/community 的 PDFLoader 加载 PDF
 * 按页提取内容，保留页面结构信息
 */
const fs = require('fs')
const path = require('path')
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf')

/**
 * 加载 PDF 文件，返回 LangChain Document 数组
 * @param {string} filePath - PDF 文件路径（相对或绝对）
 * @returns {Promise<{documents: import('@langchain/core/documents').Document[], fullText: string, pageCount: number}>}
 */
async function loadPdfDocuments(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    console.log('PDF加载：文件路径为空或无效')
    return { documents: [], fullText: '', pageCount: 0 }
  }

  const cleanPath = filePath.replace(/^\/+/, '')
  const backendDir = path.dirname(path.dirname(__dirname))
  const absolutePath = path.isAbsolute(cleanPath) ? cleanPath : path.join(backendDir, cleanPath)

  if (!fs.existsSync(absolutePath)) {
    console.log('PDF加载：文件不存在 -', absolutePath)
    return { documents: [], fullText: '', pageCount: 0 }
  }

  try {
    const loader = new PDFLoader(absolutePath, {
      parsedItemSeparator: '\n'
    })

    const documents = await loader.load()
    const pageCount = documents.length
    const fullTextParts = []
    const fileName = path.basename(filePath)

    for (const doc of documents) {
      const pageNum = (doc.metadata?.loc?.pageNumber) || 1
      fullTextParts.push(`--- 第 ${pageNum} 页 ---\n${doc.pageContent}`)
    }

    const fullText = fullTextParts.join('\n\n')

    if (!fullText || fullText.trim().length === 0) {
      console.log('PDF加载：文件内容为空（可能是扫描件或加密PDF）')
      return { documents: [], fullText: '', pageCount }
    }

    // 更新 metadata 为统一格式
    for (const doc of documents) {
      doc.metadata.source = fileName
      doc.metadata.filePath = absolutePath
      doc.metadata.totalPages = pageCount
    }

    console.log(`PDF加载成功：${pageCount} 页，${fullText.length} 字符`)
    return { documents, fullText, pageCount }
  } catch (err) {
    console.error('PDF加载失败:', err.message)
    return { documents: [], fullText: '', pageCount: 0 }
  }
}

module.exports = { loadPdfDocuments }
