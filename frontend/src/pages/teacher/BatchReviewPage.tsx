import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Select, Tree, Empty, Button, Modal, message, Spin, Tag, Badge } from 'antd'
import {
  CheckCircleOutlined, MinusCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, EyeOutlined, EditOutlined,
  ReadOutlined, DownloadOutlined, LoadingOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
  FileTextOutlined, UserOutlined, TeamOutlined,
  UnorderedListOutlined, RobotOutlined,
  LeftOutlined, RightOutlined
} from '@ant-design/icons'
import api from '@/api'
import { formatDateTime, calcPeriods } from '@/utils/format'
import {
  getSubmissionFileMeta, renderFileTypeIcon,
  isImageFile, isPdfFile, isDocxFile, isOfficeFile,
  convertDocxToHtml
} from '@/utils/file'
import { formatRichTextForDisplay, htmlToPlainText } from '@/utils/richText'
import { formatSimpleMarkdown } from '@/utils/markdown'
import { sanitizeHtml } from '@/utils/sanitizeHtml'
import RichTextEditor from '@/components/common/RichTextEditor'
import { AiChatPanel } from '@/components/ai'
import type { TaskItem, SubmissionItem, StudentItem } from '@/types'

/** 附件预览栏最小宽度 / 右侧聊天区最小保留宽度 */
const PREVIEW_MIN_PX = 280
const CHAT_MIN_PX = 320

/** 分隔条拖动会话，只存在于拖动期间：用 ref 承载，避免每帧 setState */
interface PreviewDragState {
  pointerId: number
  startX: number
  startPx: number
  containerWidth: number
  maxPx: number
  pendingPx: number
  rafId: number
}

export default function TeacherBatchReviewPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [students, setStudents] = useState<StudentItem[]>([])
  const [taskWeeks, setTaskWeeks] = useState<Record<number, number>>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [docxPreviewHtml, setDocxPreviewHtml] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [evalContent, setEvalContent] = useState('')
  const [evalModalVisible, setEvalModalVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentEvalSubmission, setCurrentEvalSubmission] = useState<SubmissionItem | null>(null)
  const [currentCheckStatus, setCurrentCheckStatus] = useState('pending')
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  // AI 面板左侧的附件预览：宽度百分比 / 是否收起（窄屏默认收起）
  const [aiPreviewWidth, setAiPreviewWidth] = useState(45)
  const [aiPreviewCollapsed, setAiPreviewCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1100
  )
  const aiOverlayRef = useRef<HTMLDivElement | null>(null)
  const aiPreviewRef = useRef<HTMLDivElement | null>(null)
  const previewDragRef = useRef<PreviewDragState | null>(null)
  const [previewResizing, setPreviewResizing] = useState(false)

  // initialContent 用于「导入导师评价」时携带 AI 回复内容
  const openEvalModal = useCallback((submission?: SubmissionItem | null, initialContent?: string) => {
    if (submission) {
      setCurrentEvalSubmission(submission)
      setEvalContent(initialContent !== undefined ? initialContent : (submission.check_remark || ''))
      setCurrentCheckStatus(submission.check_status || 'pending')
    }
    setEvalModalVisible(true)
  }, [])

  const closeEvalModal = useCallback(() => {
    setEvalModalVisible(false)
    setEvalContent('')
    setCurrentEvalSubmission(null)
    setCurrentCheckStatus('pending')
  }, [])

  const loadData = useCallback(async () => {
    try {
      const [tasksRes, submissionsRes, studentsRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/submissions'),
        api.get('/users/students')
      ])
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : [])
      setSubmissions(Array.isArray(submissionsRes.data) ? submissionsRes.data : [])
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : [])
    } catch {
      setTasks([])
      setSubmissions([])
      setStudents([])
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (tasks.length === 0) return
    setTaskWeeks(prev => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const merged = { ...prev }
      for (const task of tasks) {
        if (task.id in prev) continue
        const periods = calcPeriodsForTask(task)
        let found = false
        for (const period of periods) {
          if (today >= period.startDate && today <= period.endDate) {
            merged[task.id] = period.index
            found = true
            break
          }
        }
        if (!found) {
          merged[task.id] = periods.length > 0 ? periods[periods.length - 1].index : 1
        }
      }
      return merged
    })
  }, [tasks])

  const calcPeriodsForTask = (task: TaskItem) => calcPeriods(task)

  const getTaskWeek = useCallback((taskId: number) => taskWeeks[taskId] ?? 1, [taskWeeks])

  const getTaskWeekOptions = useCallback((task: TaskItem) => {
    const periods = calcPeriodsForTask(task)
    return periods.map(p => ({ value: p.index, label: `第${p.index}周` }))
  }, [])

  const getSubInWeek = useCallback((taskId: number, studentId: number, weekIndex: number) => {
    return submissions.find(s => {
      if (s.task_id !== taskId || String(s.student_id) !== String(studentId)) return false
      const subWeek = Number(s.week_number) || 1
      return subWeek === weekIndex
    })
  }, [submissions])

  // ------ 统计数据 ------
  const stats = useMemo(() => {
    const totalStudents = new Set<number>()
    let totalSubmitted = 0
    let totalApproved = 0

    tasks.forEach(task => {
      let studentIds: number[] = []
      try {
        const parsed = JSON.parse(String(task.student_ids || '[]'))
        if (Array.isArray(parsed)) studentIds = parsed.map(Number)
      } catch { /* empty */ }
      studentIds.forEach(id => totalStudents.add(id))

      const week = getTaskWeek(task.id)
      studentIds.forEach(sid => {
        const sub = getSubInWeek(task.id, sid, week)
        if (sub) {
          totalSubmitted++
          if (sub.check_status === 'approved') totalApproved++
        }
      })
    })

    return { taskCount: tasks.length, studentCount: totalStudents.size, totalSubmitted, totalApproved }
  }, [tasks, getTaskWeek, getSubInWeek])

  // ------ 树数据 ------
  const treeData = useMemo(() => {
    return tasks.map(task => {
      let studentIds: number[] = []
      try {
        const parsed = JSON.parse(String(task.student_ids || '[]'))
        if (Array.isArray(parsed)) studentIds = parsed.map(Number)
      } catch { /* empty */ }

      const taskWeek = getTaskWeek(task.id)
      const weekOptions = getTaskWeekOptions(task)
      const periods = calcPeriodsForTask(task)

      // 任务级别的提交统计
      let taskSubmitted = 0
      let taskApproved = 0
      studentIds.forEach(sid => {
        const sub = getSubInWeek(task.id, sid, taskWeek)
        if (sub) {
          taskSubmitted++
          if (sub.check_status === 'approved') taskApproved++
        }
      })

      const children = studentIds.map(sid => {
        const stu = students.find(s => s.id === sid)
        const sub = getSubInWeek(task.id, sid, taskWeek)
        const checkStatus = sub?.check_status

        let statusDot: React.ReactNode
        let rowClass = 'br-student-row'
        if (!sub) {
          statusDot = <span className="br-status-dot br-dot-empty" />
          rowClass += ' br-student-empty'
        } else if (checkStatus === 'approved') {
          statusDot = <CheckCircleOutlined className="br-status-icon br-icon-approved" />
          rowClass += ' br-student-approved'
        } else if (checkStatus === 'rejected') {
          statusDot = <CloseCircleOutlined className="br-status-icon br-icon-rejected" />
          rowClass += ' br-student-rejected'
        } else {
          statusDot = <ClockCircleOutlined className="br-status-icon br-icon-pending" />
          rowClass += ' br-student-pending'
        }

        return {
          key: `${task.id}-${sid}`,
          title: (
            <div className={rowClass}>
              {statusDot}
              <span className="br-student-id">{stu?.student_id || sid}</span>
              <span className="br-student-name">{stu?.username || '未知'}</span>
            </div>
          ),
          isLeaf: true
        }
      })

      return {
        key: `task-${task.id}`,
        title: (
          <div className="br-task-header" onClick={e => e.stopPropagation()}>
            <div className="br-task-title-row">
              <FileTextOutlined className="br-task-icon" />
              <span className="br-task-name">{task.title}</span>
              <span className="br-task-weeks">共{periods.length}周</span>
            </div>
            <div className="br-task-meta-row" onClick={e => e.stopPropagation()}>
              <Select
                size="small"
                value={taskWeek}
                onChange={val => {
                  setTaskWeeks(prev => ({ ...prev, [task.id]: val }))
                  setSelectedKey(null)
                  closePreview()
                }}
                options={weekOptions}
                className="br-week-select"
                popupMatchSelectWidth={false}
                onClick={e => e.stopPropagation()}
              />
              <span className="br-task-progress">
                {taskSubmitted}/{studentIds.length} 已提交
              </span>
            </div>
          </div>
        ),
        children,
        selectable: false
      }
    })
  }, [tasks, students, taskWeeks, getSubInWeek, getTaskWeek, getTaskWeekOptions])

  // ------ 右侧选中信息 ------
  const selectedSubmission = useMemo(() => {
    if (!selectedKey || selectedKey.startsWith('task-')) return null
    const [taskIdStr, studentIdStr] = selectedKey.split('-')
    const taskId = Number(taskIdStr)
    return getSubInWeek(taskId, Number(studentIdStr), getTaskWeek(taskId))
  }, [selectedKey, getSubInWeek, getTaskWeek])

  const selectedStudent = useMemo(() => {
    if (!selectedKey || selectedKey.startsWith('task-')) return null
    const [, studentIdStr] = selectedKey.split('-')
    return students.find(s => s.id === Number(studentIdStr)) || null
  }, [selectedKey, students])

  const selectedTask = useMemo(() => {
    if (!selectedKey) return null
    const taskIdStr = selectedKey.startsWith('task-') ? selectedKey.replace('task-', '') : selectedKey.split('-')[0]
    return tasks.find(t => t.id === Number(taskIdStr)) || null
  }, [selectedKey, tasks])

  useEffect(() => {
    setEvalContent(selectedSubmission?.check_remark || '')
    setPreviewUrl(null)
    setDocxPreviewHtml(null)
    setPreviewError(null)
    setPdfFullscreen(false)
    setShowAiPanel(false)
    setPreviewResizing(false)
  }, [selectedSubmission])

  // 面板卸载时恢复被拖动改写的全局样式，避免光标/选区被永久锁住
  useEffect(() => () => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  /**
   * 导入 AI 导师评价：
   * 把 AI 回复的 Markdown 转成富文本，附加到当前提交的评语中，
   * 并直接打开「审核评价」弹窗，老师确认后再点「保存审核」写入。
   */
  const handleImportAiEvaluation = useCallback((aiContent: string) => {
    const submission = selectedSubmission
    if (!submission) {
      message.warning('请先在左侧选择学生的提交')
      return
    }

    const importedHtml = formatSimpleMarkdown(aiContent).trim()
    if (!importedHtml) {
      message.warning('该条 AI 回复内容为空，无法导入')
      return
    }

    const existingHtml = formatRichTextForDisplay(submission.check_remark || '')
    const importedText = htmlToPlainText(importedHtml)
    const existingText = htmlToPlainText(existingHtml)

    // 先收起 AI 面板，让老师回到审阅界面查看审核弹窗
    setShowAiPanel(false)

    if (importedText && existingText.includes(importedText)) {
      message.info('该 AI 评价内容已在评语中，无需重复导入')
      openEvalModal(submission)
      return
    }

    const mergedContent = existingText
      ? `${existingHtml}<p><br/></p>${importedHtml}`
      : importedHtml

    openEvalModal(submission, mergedContent)
    message.success('已导入 AI 导师评价，确认后点击「保存审核」')
  }, [selectedSubmission, openEvalModal])

  const handleSaveEval = useCallback(async () => {
    if (!currentEvalSubmission) {
      message.warning('请先选择一个学生的提交')
      return
    }
    setSaving(true)
    try {
      await api.put(`/submissions/${currentEvalSubmission.id}/review`, {
        check_status: currentCheckStatus,
        check_remark: evalContent
      })
      message.success('审核已保存')
      loadData()
      closeEvalModal()
    } catch (error: any) {
      message.error(error.response?.data?.error || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [currentEvalSubmission, evalContent, loadData, currentCheckStatus])

  const fileMeta = useMemo(() => {
    if (!selectedSubmission) return null
    return getSubmissionFileMeta(selectedSubmission)
  }, [selectedSubmission])

  // 富文本清洗要跑一次 DOMParser + 全量 DOM 遍历，缓存起来避免每次渲染都重算
  const submitContentHtml = useMemo(
    () => formatRichTextForDisplay(selectedSubmission?.submit_content),
    [selectedSubmission]
  )

  const handleOpenAiPanel = useCallback(() => {
    setPreviewResizing(false)
    setShowAiPanel(true)
  }, [])

  const handleCloseAiPanel = useCallback(() => setShowAiPanel(false), [])

  const handlePreview = useCallback(async (url: string) => {
    setPreviewUrl(url)
    setDocxPreviewHtml(null)
    setPreviewError(null)

    if (isDocxFile(url)) {
      setPreviewLoading(true)
      try {
        const html = await convertDocxToHtml(url)
        setDocxPreviewHtml(html)
      } catch {
        setPreviewError('Word 文档加载失败，请尝试下载后查看')
      } finally {
        setPreviewLoading(false)
      }
    }
  }, [])

  const handleDownload = useCallback((url: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileMeta?.name || ''
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [fileMeta])

  const closePreview = useCallback(() => {
    setPreviewUrl(null)
    setDocxPreviewHtml(null)
    setPreviewError(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pdfFullscreen) {
        setPdfFullscreen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [pdfFullscreen])

  const getPreviewTitle = () => {
    if (!previewUrl) return '附件预览'
    if (isImageFile(previewUrl)) return '图片预览'
    if (isPdfFile(previewUrl)) return 'PDF预览'
    if (isDocxFile(previewUrl)) return 'Word文档预览'
    if (isOfficeFile(previewUrl)) return '文档预览'
    return '附件预览'
  }

  /**
   * 拖动分隔条调整 AI 面板左侧附件预览的宽度。
   *
   * 性能要点（这三点是原来卡顿的根因）：
   * 1. 拖动期间只按 rAF 合帧直接写 DOM 宽度，不 setState。原来每个 mousemove 都
   *    setAiPreviewWidth，等于每帧重渲染整个 931 行的页面（Tree + AI 面板 + 全部气泡）。
   * 2. 用 pointer capture 把 move/up 绑在分隔条自身：指针移出窗口或掠过 PDF iframe
   *    也不会丢事件。老实现挂在 document 上，一旦漏掉 mouseup 就会残留监听器
   *    （之后鼠标随便移动都会改宽度），并把 br-ai-resizing 永久锁住。
   * 3. 松手时才把像素宽度换算回百分比同步进 state。
   */
  const handlePreviewResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const container = aiOverlayRef.current
    const pane = aiPreviewRef.current
    if (!container || !pane) return
    const rect = container.getBoundingClientRect()
    const startPx = pane.offsetWidth
    if (rect.width <= 0 || startPx <= 0) return

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)

    previewDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startPx,
      containerWidth: rect.width,
      maxPx: Math.max(PREVIEW_MIN_PX, rect.width - CHAT_MIN_PX),
      pendingPx: startPx,
      rafId: 0
    }

    setPreviewResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handlePreviewResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    drag.pendingPx = Math.min(
      Math.max(drag.startPx + (e.clientX - drag.startX), PREVIEW_MIN_PX),
      drag.maxPx
    )
    if (drag.rafId) return
    drag.rafId = requestAnimationFrame(() => {
      drag.rafId = 0
      if (aiPreviewRef.current) aiPreviewRef.current.style.width = drag.pendingPx + 'px'
    })
  }, [])

  const handlePreviewResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = previewDragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    previewDragRef.current = null

    if (drag.rafId) cancelAnimationFrame(drag.rafId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    const percent = (drag.pendingPx / drag.containerWidth) * 100
    // 先把最终宽度写回百分比，这样即使下面 setState 因值相同被 React 跳过，DOM 也不会残留 px
    if (aiPreviewRef.current) aiPreviewRef.current.style.width = percent + '%'
    setAiPreviewWidth(percent)
    setPreviewResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  return (
    <>
      <div className="batch-review-page">
        {/* ========== 左侧面板 ========== */}
        <div className="batch-review-left">
          {/* 统计头部 */}
          <div className="br-left-header">
            <div className="br-left-title">
              <UnorderedListOutlined />
              <span>任务列表</span>
            </div>
            <div className="br-left-stats">
              <div className="br-stat-item">
                <FileTextOutlined />
                <span>{stats.taskCount} 个任务</span>
              </div>
              <div className="br-stat-item">
                <TeamOutlined />
                <span>{stats.studentCount} 名学生</span>
              </div>
            </div>
            <div className="br-left-progress-bar">
              <div className="br-progress-inner" style={{ width: `${stats.totalSubmitted > 0 ? Math.round((stats.totalApproved / Math.max(stats.totalSubmitted, 1)) * 100) : 0}%` }} />
            </div>
            <div className="br-left-progress-text">
              已审 {stats.totalApproved}/{stats.totalSubmitted} 项提交
            </div>
          </div>

          {/* 任务树 */}
          <div className="batch-review-tree">
            {treeData.length > 0 ? (
              <Tree
                treeData={treeData}
                selectedKeys={selectedKey && !selectedKey.startsWith('task-') ? [selectedKey] : []}
                onSelect={(keys) => {
                  if (keys.length > 0 && typeof keys[0] === 'string' && !keys[0].startsWith('task-')) {
                    setSelectedKey(keys[0] as string)
                  }
                }}
                defaultExpandAll
                showLine={{ showLeafIcon: false }}
                className="br-tree"
              />
            ) : (
              <div className="br-left-empty">
                <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </div>
        </div>

        {/* ========== 右侧内容区 ========== */}
        <div className="batch-review-right">
          {!selectedKey || selectedKey.startsWith('task-') ? (
            <div className="br-welcome">
              <div className="br-welcome-icon">
                <UserOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)' }} />
              </div>
              <div className="br-welcome-title">一键审阅</div>
              <div className="br-welcome-desc">在左侧选择学生，查看提交内容并审核</div>
              {stats.taskCount > 0 && (
                <div className="br-welcome-hint">
                  {stats.taskCount} 个任务待审阅，共 {stats.studentCount} 名学生
                </div>
              )}
            </div>
          ) : (
            <div className="batch-review-content">
              {/* 顶部信息栏 */}
              <div className="br-top-bar">
                <div className="br-top-left">
                  <div className="br-top-avatar">
                    {(selectedStudent?.username || '?')[0]}
                  </div>
                  <div className="br-top-info">
                    <div className="br-top-student">
                      {selectedStudent?.username || '未知'}
                      <span className="br-top-student-id">{selectedStudent?.student_id}</span>
                    </div>
                    <div className="br-top-task">
                      <FileTextOutlined style={{ fontSize: 12 }} />
                      {selectedTask?.title}
                      <Tag className="br-week-tag">第{selectedTask ? getTaskWeek(selectedTask.id) : '?'}周</Tag>
                    </div>
                  </div>
                </div>

                <div className="br-top-right">
                  {selectedSubmission ? (
                    <div className="br-top-submission">
                      <span className="br-top-time">
                        <ClockCircleOutlined style={{ fontSize: 11 }} />
                        {formatDateTime(selectedSubmission.submit_time)}
                      </span>
                      {fileMeta && (
                        <div className="br-top-file">
                          {renderFileTypeIcon(fileMeta.name)}
                          <span
                            className="br-top-file-link"
                            onClick={() => handlePreview(fileMeta.url)}
                            title="点击预览文件"
                          >
                            {fileMeta.name}
                          </span>
                          <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => handlePreview(fileMeta.url)}
                            title="预览"
                          />
                          <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(fileMeta.url)}
                            title="下载"
                          />
                        </div>
                      )}
                      <div className="br-top-status-row">
                        <Tag color={
                          selectedSubmission.check_status === 'approved' ? 'success' :
                          selectedSubmission.check_status === 'rejected' ? 'error' : 'processing'
                        }>
                          {selectedSubmission.check_status === 'approved' ? '已通过' :
                           selectedSubmission.check_status === 'rejected' ? '未通过' : '待审核'}
                        </Tag>
                        <Button
                          type={selectedSubmission.check_remark ? 'default' : 'primary'}
                          size="small"
                          icon={selectedSubmission.check_remark ? <ReadOutlined /> : <EditOutlined />}
                          onClick={() => openEvalModal(selectedSubmission)}
                        >
                          {selectedSubmission.check_remark ? '查看/修改审核' : '审核评价'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="br-top-empty">
                      <MinusCircleOutlined style={{ color: 'var(--text-tertiary)', fontSize: 14 }} />
                      <span>本周未提交</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 内容展示区 */}
              <div className="br-middle">
                {selectedSubmission?.submit_content && (
                  <div className="br-content-card">
                    <div className="br-card-label">提交内容</div>
                    <div className="br-content-html" dangerouslySetInnerHTML={{ __html: submitContentHtml }} />
                  </div>
                )}

                {fileMeta && isPdfFile(fileMeta.url) && (
                  <div className="br-content-card br-pdf-card">
                    <div className="br-card-label">PDF附件</div>
                    <div className="br-pdf-inline">
                      <div className="br-pdf-header">
                        <span className="br-pdf-title">
                          {renderFileTypeIcon(fileMeta.name)}
                          <span>{fileMeta.name}</span>
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <Button
                            type="text"
                            size="small"
                            icon={<FullscreenOutlined />}
                            onClick={() => setPdfFullscreen(true)}
                            title="全屏查看PDF"
                          />
                          <Button
                            type="text"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(fileMeta.url)}
                            title="下载文件"
                          />
                        </div>
                      </div>
                      <iframe
                        src={fileMeta.url}
                        className="br-pdf-iframe"
                        title="PDF预览"
                      />
                    </div>
                  </div>
                )}

                {!selectedSubmission?.submit_content && !(fileMeta && isPdfFile(fileMeta.url)) && (
                  <div className="br-content-empty">
                    {selectedSubmission && fileMeta ? (
                      <>
                        <div className="br-content-card">
                          <div className="br-card-label">提交附件</div>
                          <div className="br-file-card">
                            {renderFileTypeIcon(fileMeta.name)}
                            <span className="br-file-name">{fileMeta.name}</span>
                            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                              <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={() => handlePreview(fileMeta.url)}
                              >
                                预览
                              </Button>
                              <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownload(fileMeta.url)}
                              >
                                下载
                              </Button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : selectedSubmission ? (
                      <div className="br-content-empty-state">
                        <FileTextOutlined style={{ fontSize: 40, color: 'var(--text-tertiary)' }} />
                        <p>无提交内容</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {!selectedSubmission && (
                  <div className="br-content-empty-state">
                    <MinusCircleOutlined style={{ fontSize: 40, color: 'var(--icon-unsubmitted)', opacity: 0.3 }} />
                    <p>该学生本周未提交</p>
                  </div>
                )}

                {/* 悬浮 AI 按钮 */}
                <div className="br-ai-fab" onClick={handleOpenAiPanel} title="AI 助手">
                  <RobotOutlined style={{ fontSize: 24 }} />
                  <span className="br-ai-fab-label">AI</span>
                </div>
              </div>
            </div>
          )}

          {/* AI 助手面板 — 全屏覆盖，左侧并排附件预览 */}
          {selectedSubmission && showAiPanel && (
            <div className={`br-ai-overlay${previewResizing ? ' br-ai-resizing' : ''}`} ref={aiOverlayRef}>
              {/* 左侧：附件预览（PDF 可滚动查看） */}
              {fileMeta && !aiPreviewCollapsed && (
                <>
                  <div className="br-ai-preview" ref={aiPreviewRef} style={{ width: `${aiPreviewWidth}%` }}>
                    <div className="br-ai-preview-header">
                      <span className="br-ai-preview-title" title={fileMeta.name}>
                        {renderFileTypeIcon(fileMeta.name)}
                        <span>{fileMeta.name}</span>
                      </span>
                      <div className="br-ai-preview-actions">
                        {isPdfFile(fileMeta.url) && (
                          <Button
                            type="text" size="small" icon={<FullscreenOutlined />}
                            onClick={() => setPdfFullscreen(true)} title="全屏查看"
                          />
                        )}
                        <Button
                          type="text" size="small" icon={<DownloadOutlined />}
                          onClick={() => handleDownload(fileMeta.url)} title="下载附件"
                        />
                        <Button
                          type="text" size="small" icon={<LeftOutlined />}
                          onClick={() => setAiPreviewCollapsed(true)} title="收起预览"
                        />
                      </div>
                    </div>
                    <div className="br-ai-preview-body">
                      {previewResizing && isPdfFile(fileMeta.url) && (
                        <div className="br-ai-preview-drag-hint">拖动中，松开后恢复预览</div>
                      )}
                      {isPdfFile(fileMeta.url) ? (
                        <iframe
                          src={fileMeta.url}
                          className="br-ai-preview-iframe"
                          title="附件预览"
                        />
                      ) : isImageFile(fileMeta.url) ? (
                        <img src={fileMeta.url} alt={fileMeta.name} className="br-ai-preview-image" />
                      ) : (
                        <div className="br-ai-preview-fallback">
                          <span style={{ fontSize: 32 }}>{renderFileTypeIcon(fileMeta.name)}</span>
                          <p>该附件格式不支持并排预览</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(fileMeta.url)}>
                              弹窗预览
                            </Button>
                            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(fileMeta.url)}>
                              下载查看
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="br-ai-preview-resizer"
                    onPointerDown={handlePreviewResizeStart}
                    onPointerMove={handlePreviewResizeMove}
                    onPointerUp={handlePreviewResizeEnd}
                    onPointerCancel={handlePreviewResizeEnd}
                    onLostPointerCapture={handlePreviewResizeEnd}
                    title="拖动调整预览宽度"
                  />
                </>
              )}

              {/* 收起后的窄条，点击展开 */}
              {fileMeta && aiPreviewCollapsed && (
                <div
                  className="br-ai-preview-collapsed"
                  onClick={() => setAiPreviewCollapsed(false)}
                  title="展开附件预览"
                >
                  <RightOutlined />
                  <span>附件预览</span>
                </div>
              )}

              <div className="br-ai-chat">
                <AiChatPanel
                  submissionId={selectedSubmission.id}
                  studentId={selectedStudent?.id || 0}
                  studentName={selectedStudent?.username || selectedStudent?.student_id || '未知'}
                  taskTitle={selectedTask?.title || '未知任务'}
                  taskId={selectedTask?.id || 0}
                  students={students}
                  onClose={handleCloseAiPanel}
                  onImportEvaluation={handleImportAiEvaluation}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF 全屏 */}
      {pdfFullscreen && fileMeta && (
        <div className="pdf-fullscreen-overlay">
          <div className="pdf-fullscreen-toolbar">
            <span className="br-pdf-fs-title">
              {renderFileTypeIcon(fileMeta.name)}
              <span>{fileMeta.name}</span>
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => handleDownload(fileMeta.url)}>
                下载
              </Button>
              <Button icon={<FullscreenExitOutlined />} onClick={() => setPdfFullscreen(false)}>
                退出全屏
              </Button>
            </div>
          </div>
          <iframe src={fileMeta.url} className="pdf-fullscreen-iframe" title="PDF全屏查看" />
        </div>
      )}

      {/* 审核评价弹窗 */}
      <Modal
        title="审核评价"
        open={evalModalVisible}
        onCancel={closeEvalModal}
        footer={[
          <Button key="back" onClick={closeEvalModal}>取消</Button>,
          <Button key="submit" type="primary" loading={saving} onClick={handleSaveEval}>保存审核</Button>
        ]}
        width={700}
        destroyOnClose
        styles={{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 500 }}>审核状态：</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type={currentCheckStatus === 'pending' ? 'primary' : 'default'}
                onClick={() => setCurrentCheckStatus('pending')}
              >
                待审核
              </Button>
              <Button
                type={currentCheckStatus === 'approved' ? 'primary' : 'default'}
                onClick={() => setCurrentCheckStatus('approved')}
                icon={<CheckCircleOutlined />}
              >
                通过
              </Button>
              <Button
                type={currentCheckStatus === 'rejected' ? 'primary' : 'default'}
                onClick={() => setCurrentCheckStatus('rejected')}
                icon={<MinusCircleOutlined />}
              >
                未通过
              </Button>
            </div>
          </div>
          <div className="batch-review-eval-field">
            <span className="batch-review-eval-label">评语内容：</span>
            {/* 评语框固定高度，长评语（含导入的 AI 评价）在框内滚动，不再撑高弹窗 */}
            <div className="batch-review-eval-modal-editor">
              <RichTextEditor
                value={evalContent}
                onChange={setEvalContent}
                placeholder="输入教师点评信息..."
                onUploadImage={async (file: File) => {
                  const formData = new FormData()
                  formData.append('content_image', file)
                  const res = await api.post('/submissions/upload-image', formData)
                  return { url: res.data.url, name: file.name }
                }}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* 附件预览弹窗 */}
      <Modal
        title={getPreviewTitle()}
        open={!!previewUrl}
        onCancel={closePreview}
        footer={previewUrl ? [
          <Button key="download" icon={<DownloadOutlined />} onClick={() => handleDownload(previewUrl!)}>
            下载文件
          </Button>,
          <Button key="close" onClick={closePreview}>关闭</Button>
        ] : null}
        width={isImageFile(previewUrl || '') ? 800 : '90vw'}
        style={previewUrl && !isImageFile(previewUrl || '') ? { top: 20 } : undefined}
        destroyOnClose
      >
        {previewUrl && isImageFile(previewUrl) && (
          <div style={{ textAlign: 'center' }}>
            <img src={previewUrl} alt="附件预览" style={{ maxWidth: '100%', maxHeight: '70vh' }} />
          </div>
        )}
        {previewUrl && isPdfFile(previewUrl) && (
          <iframe
            src={previewUrl}
            style={{ width: '100%', height: '80vh', border: 'none', borderRadius: 4 }}
            title="PDF预览"
          />
        )}
        {previewUrl && isDocxFile(previewUrl) && (
          previewLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
              <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>正在解析Word文档...</p>
            </div>
          ) : previewError ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#ef4444', marginBottom: 16 }}>{previewError}</p>
              <Button icon={<DownloadOutlined />} onClick={() => handleDownload(previewUrl)}>下载文件</Button>
            </div>
          ) : docxPreviewHtml ? (
            <div
              className="batch-review-docx-preview"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(docxPreviewHtml) }}
            />
          ) : null
        )}
        {previewUrl && !isImageFile(previewUrl) && !isPdfFile(previewUrl) && !isDocxFile(previewUrl) && isOfficeFile(previewUrl) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '12px 16px', background: 'var(--bg-soft)', borderRadius: 8,
              border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8
            }}>
              {renderFileTypeIcon(previewUrl)}
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{fileMeta?.name || '文档文件'}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                {/\.pptx?$/i.test(previewUrl) ? 'PPT' : 'Excel'} 文件
              </span>
            </div>
            <div style={{
              padding: 32, textAlign: 'center', background: 'var(--bg-soft)',
              borderRadius: 8, border: '1px dashed var(--border-color)'
            }}>
              <span style={{ fontSize: 48, color: 'var(--text-tertiary)', marginBottom: 16, display: 'block' }}>
                {renderFileTypeIcon(previewUrl)}
              </span>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
                当前浏览器不支持直接预览此文件格式
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>
                请点击下方按钮下载文件后查看
              </p>
              <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(previewUrl)}>
                下载文件
              </Button>
            </div>
          </div>
        )}
        {previewUrl && !isImageFile(previewUrl) && !isPdfFile(previewUrl) && !isOfficeFile(previewUrl) && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>此文件类型暂不支持在线预览</p>
            <Button icon={<DownloadOutlined />} onClick={() => handleDownload(previewUrl)}>下载文件</Button>
          </div>
        )}
      </Modal>
    </>
  )
}
