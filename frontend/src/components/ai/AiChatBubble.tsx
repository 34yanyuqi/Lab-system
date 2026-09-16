import { useState, useCallback, useMemo, memo } from 'react'
import { CopyOutlined, CheckOutlined, FormOutlined } from '@ant-design/icons'
import type { AiChatMessage } from '@/types'
import { formatSimpleMarkdown } from '@/utils/markdown'

interface AiChatBubbleProps {
  message: AiChatMessage
  /** 点击「导入导师评价」时回调，参数为 AI 回复的原始 Markdown 文本 */
  onImportEvaluation?: (content: string) => void
}

function AiChatBubbleBase({ message, onImportEvaluation }: AiChatBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0

  // 流式回答每来一个 token 都会重渲染一次，Markdown 转换结果必须缓存
  const renderedHtml = useMemo(
    () => (isUser ? '' : formatSimpleMarkdown(message.content)),
    [isUser, message.content]
  )

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
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
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

/**
 * 消息列表里的历史气泡内容不会变，memo 后流式输出时只有最新那条会重渲染。
 */
export default memo(AiChatBubbleBase)
