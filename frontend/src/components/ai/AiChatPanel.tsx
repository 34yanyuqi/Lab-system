/**
 * AI 助手面板 — 支持两种模式：
 * 1. 文档问答：基于当前提交 PDF 的对话
 * 2. 进度审阅：选择多个周次 PDF 进行对比分析，支持后续追问
 *
 * 作为全屏叠加层显示，通过 onClose 返回内容区
 */
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import {
  Input, Button, Spin, Empty, Select, Checkbox, Tag, message
} from 'antd'
import {
  SendOutlined, RobotOutlined, ThunderboltOutlined,
  FilePdfOutlined, FileOutlined,
  AuditOutlined, CommentOutlined, CloseOutlined
} from '@ant-design/icons'
import type { AiChatMessage, StudentItem, StudentWeekSubmission } from '@/types'
import AiChatBubble from './AiChatBubble'
import {
  sendChatMessageStream, loadChatHistory, saveChatHistory
} from './AiChatService'
import { analyzeProgressStream, fetchStudentWeekSubmissions } from '@/api/ai'
import './AiChatPanel.css'

type PanelMode = 'chat' | 'review'

interface AiChatPanelProps {
  submissionId: number
  studentId: number
  studentName: string
  taskTitle: string
  taskId: number
  students: StudentItem[]
  onClose: () => void
  /** 将某条 AI 回复导入到审核评价的评语中（由父级打开审核弹窗） */
  onImportEvaluation?: (content: string) => void
}

let messageIdCounter = 0
function genId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

const QUICK_ACTIONS = [
  { label: '分析报告', prompt: '请帮我分析这份学生提交的报告，包括内容质量和完成度。' },
  { label: '总结内容', prompt: '请总结学生提交的核心内容要点。' }
]

function AiChatPanelBase({
  submissionId,
  studentId,
  studentName,
  taskTitle,
  taskId,
  students,
  onClose,
  onImportEvaluation
}: AiChatPanelProps) {
  // 模式
  const [mode, setMode] = useState<PanelMode>('chat')

  // 问答模式
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<any>(null)
  const messagesRef = useRef<AiChatMessage[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)

  // 审阅模式
  const [reviewStudentId, setReviewStudentId] = useState<number | null>(null)
  const [weekSubmissions, setWeekSubmissions] = useState<StudentWeekSubmission[]>([])
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<number[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 面板卸载时中断进行中的流式请求，避免更新已卸载组件的状态
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
      streamAbortRef.current = null
    }
  }, [])

  useEffect(() => {
    setMessages([])
    setInputValue('')
    setHistoryLoading(true)
    loadChatHistory(submissionId).then(history => {
      if (history.length > 0) setMessages(history)
      setHistoryLoading(false)
    }).catch(() => setHistoryLoading(false))
  }, [submissionId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ============ 问答 ============

  const handleSend = useCallback(async (text?: string) => {
    const content = text || inputValue.trim()
    if (!content || loading) return

    const userMessage: AiChatMessage = { id: genId(), role: 'user', content, timestamp: Date.now() }
    const aiMessageId = genId()
    const aiMessage: AiChatMessage = { id: aiMessageId, role: 'assistant', content: '', timestamp: Date.now() }

    setMessages(prev => [...prev, userMessage, aiMessage])
    setInputValue('')
    setLoading(true)

    const allMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))

    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller

    sendChatMessageStream(
      submissionId, allMessages,
      (token) => {
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, content: msg.content + token } : msg
        ))
      },
      () => {
        setLoading(false)
        setTimeout(() => saveChatHistory(submissionId, messagesRef.current), 100)
      },
      (error) => {
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId ? { ...msg, content: msg.content || `❌ ${error}` } : msg
        ))
        setLoading(false)
        setTimeout(() => saveChatHistory(submissionId, messagesRef.current), 100)
      },
      controller.signal
    )
  }, [inputValue, loading, messages, submissionId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleQuickAction = useCallback((prompt: string) => {
    handleSend(prompt)
  }, [handleSend])

  // ============ 审阅 ============

  // 每次渲染都重建数组会让依赖它的 handleStartAnalysis 失效，缓存起来
  const studentOptions = useMemo(() => students.map(s => ({
    value: s.id,
    label: `${s.username}（${s.student_id}）`
  })), [students])

  const handleReviewStudentChange = useCallback(async (sid: number) => {
    setReviewStudentId(sid)
    setSelectedSubmissionIds([])
    setLoadingSubmissions(true)
    try {
      const data = await fetchStudentWeekSubmissions(sid)
      setWeekSubmissions(data)
    } catch {
      setWeekSubmissions([])
      message.error('获取学生提交列表失败')
    } finally {
      setLoadingSubmissions(false)
    }
  }, [])

  const handleToggleSubmission = useCallback((sid: number) => {
    setSelectedSubmissionIds(prev =>
      prev.includes(sid) ? prev.filter(id => id !== sid) : [...prev, sid]
    )
  }, [])

  const handleStartAnalysis = useCallback(async () => {
    if (!reviewStudentId || selectedSubmissionIds.length < 2) {
      message.warning('请选择至少 2 个周次的 PDF 提交')
      return
    }
    const firstSub = weekSubmissions.find(s => s.submission_id === selectedSubmissionIds[0])
    if (!firstSub) { message.error('未找到选中提交的任务信息'); return }

    setAnalyzing(true)

    const userMsg: AiChatMessage = {
      id: genId(), role: 'user',
      content: `请分析对比 ${studentOptions.find(o => o.value === reviewStudentId)?.label || '该学生'} 的 ${selectedSubmissionIds.length} 个周次的 PDF 提交内容，评估进度情况。`,
      timestamp: Date.now()
    }
    const aiMsgId = genId()
    const aiMsg: AiChatMessage = {
      id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now(),
      studentId: reviewStudentId
    }

    setMessages(prev => [...prev, userMsg, aiMsg])

    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller

    analyzeProgressStream(
      reviewStudentId, selectedSubmissionIds, firstSub.task_id,
      (token) => {
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: m.content + token } : m
        ))
      },
      () => { setAnalyzing(false); setMode('chat') },
      (error) => {
        setAnalyzing(false)
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: m.content || `❌ ${error}` } : m
        ))
      },
      controller.signal
    )
  }, [reviewStudentId, selectedSubmissionIds, weekSubmissions, studentOptions])

  const pdfWeeks = weekSubmissions.filter(s => s.is_pdf)
  const nonPdfWeeks = weekSubmissions.filter(s => !s.is_pdf)
  const isAnalyzing = analyzing || loading

  return (
    <div className="ai-chat-panel ai-chat-overlay">
      {/* 头部 */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <RobotOutlined style={{ fontSize: 18 }} />
          <span className="ai-chat-title">AI 助手</span>
          {studentName && (
            <span className="ai-chat-context">{studentName} - {taskTitle}</span>
          )}
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          title="返回内容区"
        />
      </div>

      {/* 模式切换 */}
      <div className="ai-chat-mode-bar">
        <button
          className={`ai-mode-btn ${mode === 'chat' ? 'active' : ''}`}
          onClick={() => setMode('chat')}
        >
          <CommentOutlined /> 文档问答
        </button>
        <button
          className={`ai-mode-btn ${mode === 'review' ? 'active' : ''}`}
          onClick={() => {
            setMode('review')
            if (!reviewStudentId && studentId) handleReviewStudentChange(studentId)
          }}
        >
          <AuditOutlined /> 进度审阅
        </button>
      </div>

      {/* === 审阅配置 === */}
      {mode === 'review' && (
        <div className="ai-review-config">
          <div className="ai-review-row">
            <span className="ai-review-label">学生：</span>
            <Select
              showSearch placeholder="选择学生"
              optionFilterProp="label" options={studentOptions}
              value={reviewStudentId} onChange={handleReviewStudentChange}
              style={{ flex: 1 }}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          {reviewStudentId && (
            <div className="ai-review-week-section">
              {loadingSubmissions ? (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <Spin size="small" />
                  <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>加载提交记录...</span>
                </div>
              ) : weekSubmissions.length === 0 ? (
                <Empty description="该学生暂无提交记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <>
                  <div className="ai-review-week-header">
                    <span>选择周次（至少 2 个）：</span>
                    <span className="ai-review-count">
                      已选 {selectedSubmissionIds.length}
                      {selectedSubmissionIds.length < 2 && '（需 ≥2）'}
                    </span>
                  </div>
                  <div className="ai-review-week-list">
                    {pdfWeeks.map(sub => (
                      <div
                        key={sub.submission_id}
                        className={`ai-review-week-item ${selectedSubmissionIds.includes(sub.submission_id) ? 'selected' : ''}`}
                        onClick={() => handleToggleSubmission(sub.submission_id)}
                      >
                        <Checkbox
                          checked={selectedSubmissionIds.includes(sub.submission_id)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => handleToggleSubmission(sub.submission_id)}
                        />
                        <div className="ai-review-week-info">
                          <Tag color="blue" style={{ fontSize: 11 }}>第{sub.week_number}周</Tag>
                          <span className="ai-review-week-file">
                            <FilePdfOutlined style={{ color: '#ef4444', marginRight: 4 }} />
                            {sub.file_name}
                          </span>
                        </div>
                        <span className="ai-review-week-time">{sub.submit_time}</span>
                      </div>
                    ))}
                    {nonPdfWeeks.length > 0 && (
                      <div className="ai-review-week-group-disabled">
                        <span className="ai-review-disabled-hint">
                          <FileOutlined /> {nonPdfWeeks.length} 个非 PDF 文件不可选
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="ai-review-actions">
                    <Button
                      type="primary" onClick={handleStartAnalysis}
                      loading={analyzing} disabled={selectedSubmissionIds.length < 2 || analyzing}
                      icon={<RobotOutlined />} block
                    >
                      {analyzing ? '分析中...' : `开始分析（${selectedSubmissionIds.length} 个周次）`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* === 消息区域 === */}
      <div className="ai-chat-messages">
        {historyLoading && messages.length === 0 && (
          <div className="ai-chat-loading">
            <Spin size="small" /><span>加载历史对话...</span>
          </div>
        )}
        {!historyLoading && messages.length === 0 && !isAnalyzing && mode === 'chat' && (
          <div className="ai-chat-quick-actions">
            <div className="ai-chat-quick-title"><ThunderboltOutlined /> 快捷操作</div>
            <div className="ai-chat-quick-buttons">
              {QUICK_ACTIONS.map((action, i) => (
                <Button key={i} size="small" onClick={() => handleQuickAction(action.prompt)} loading={isAnalyzing}>
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {!historyLoading && messages.length === 0 && !isAnalyzing && mode === 'review' && (
          <Empty description="选择学生和周次后开始分析" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 24 }} />
        )}
        {messages.map(msg => (
          <AiChatBubble
            key={msg.id}
            message={msg}
            onImportEvaluation={
              isAnalyzing || (msg.studentId !== undefined && msg.studentId !== studentId)
                ? undefined
                : onImportEvaluation
            }
          />
        ))}
        {isAnalyzing && (
          <div className="ai-chat-loading"><Spin size="small" /><span>AI 思考中...</span></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* === 输入区域 === */}
      <div className="ai-chat-input-area">
        <Input.TextArea
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={isAnalyzing}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => handleSend()}
          loading={isAnalyzing}
          disabled={!inputValue.trim()}
          className="ai-chat-send-btn"
        />
      </div>

      <style>{`
        .ai-chat-overlay {
          height: 100% !important;
          max-height: none !important;
          border-radius: 0 !important;
          border: none !important;
          display: flex;
          flex-direction: column;
        }
        .ai-chat-overlay .ai-chat-messages {
          flex: 1;
          min-height: 0;
        }
        .ai-chat-mode-bar {
          display: flex; gap: 0;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-soft);
        }
        .ai-mode-btn {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 6px 12px;
          border: 1px solid var(--border-color);
          background: transparent; color: var(--text-secondary);
          font-size: 13px; cursor: pointer; transition: all 0.2s;
        }
        .ai-mode-btn:first-child { border-radius: 6px 0 0 6px; border-right: none; }
        .ai-mode-btn:last-child  { border-radius: 0 6px 6px 0; }
        .ai-mode-btn.active { background: #6366f1; color: #fff; border-color: #6366f1; font-weight: 500; }
        .ai-mode-btn:hover:not(.active) { background: rgba(99,102,241,0.06); }

        .ai-review-config {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-soft);
        }
        .ai-review-row { display: flex; align-items: center; gap: 8px; }
        .ai-review-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
        .ai-review-week-section { margin-top: 10px; }
        .ai-review-week-header {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;
        }
        .ai-review-count { font-weight: 500; color: #6366f1; }
        .ai-review-week-list {
          display: flex; flex-direction: column; gap: 3px;
          max-height: 200px; overflow-y: auto;
        }
        .ai-review-week-item {
          display: flex; align-items: center; gap: 8px;
          padding: 5px 8px; border-radius: 6px; cursor: pointer;
          transition: background 0.15s; border: 1px solid transparent;
        }
        .ai-review-week-item:hover { background: rgba(99,102,241,0.05); }
        .ai-review-week-item.selected { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.3); }
        .ai-review-week-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; }
        .ai-review-week-file {
          font-size: 12px; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ai-review-week-time { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
        .ai-review-week-group-disabled { padding: 4px 0; }
        .ai-review-disabled-hint { font-size: 11px; color: var(--text-tertiary); }
        .ai-review-actions { margin-top: 10px; }
      `}</style>
    </div>
  )
}

/**
 * 会话状态（消息列表、流式 token、模式切换）都在面板内部，
 * 外面的一键审阅页因拖动分栏、切换提交等原因重渲染时，
 * 不必连带重渲染整条消息列表。
 */
export default memo(AiChatPanelBase)
