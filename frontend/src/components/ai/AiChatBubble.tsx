import { useState, useCallback } from 'react'
import { CopyOutlined, CheckOutlined, FormOutlined } from '@ant-design/icons'
import type { AiChatMessage } from '@/types'
import { formatSimpleMarkdown } from '@/utils/markdown'

interface AiChatBubbleProps {
  message: AiChatMessage
  /** 点击「导入导师评价」时回调，参数为 AI 回复的原始 Markdown 文本 */
  onImportEvaluation?: (content: string) => void
}

export default function AiChatBubble({ message, onImportEvaluation }: AiChatBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message.content])

  const handleImport = useCallback(() => {
    onImportEvaluation?.(message.content)
  }, [message.content, onImportEvaluation])

  const renderContent = () => {
    if (isUser) {
      return <p className="ai-bubble-text">{message.content}</p>
    }
    return (
      <div
        className="ai-bubble-markdown"
        dangerouslySetInnerHTML={{ __html: formatSimpleMarkdown(message.content) }}
      />
    )
  }

  return (
    <div className={`ai-bubble ${isUser ? 'ai-bubble-user' : 'ai-bubble-assistant'}`}>
      <div className="ai-bubble-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="ai-bubble-content">
        {renderContent()}
        {!isUser && hasContent && (
          <div className="ai-bubble-actions">
            {onImportEvaluation && (
              <button
                type="button"
                className="ai-bubble-action ai-bubble-import"
                onClick={handleImport}
                title="将本条 AI 回复作为评语写入审核评价"
              >
                <FormOutlined /> 导入导师评价
              </button>
            )}
            <button
              type="button"
              className="ai-bubble-action"
              onClick={handleCopy}
              title="复制内容"
            >
              {copied ? <CheckOutlined /> : <CopyOutlined />} 复制
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
