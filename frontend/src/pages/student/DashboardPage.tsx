import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Empty, Modal, Table, Tag, Button, Descriptions, Progress } from 'antd'
import {
  EyeOutlined, EditOutlined, PlusCircleOutlined, MinusCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, DownloadOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '@/api'
import { useAuth } from '@/contexts'
import type { TaskItem, SubmissionItem } from '@/types'
import { getTypeLabel, getTagColor, getReviewTagColor, reviewStatusLabels } from '@/config'
import { formatDate, formatDateTime, formatRichTextForDisplay, getDeadlineTime, calcPeriods as calcBasePeriods } from '@/utils/format'
import { renderAttachmentLink, getSubmissionFileMeta, isPdfFile, renderFileTypeIcon } from '@/utils/file'

export default function StudentDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [currentSubmission, setCurrentSubmission] = useState<SubmissionItem | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  const [currentTask, setCurrentTask] = useState<TaskItem | null>(null)
  const [taskSubmissions, setTaskSubmissions] = useState<SubmissionItem[]>([])
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const [pdfPreviewSubmission, setPdfPreviewSubmission] = useState<SubmissionItem | null>(null)

  const loadData = useCallback(() => {
    api.get('/tasks').then(response => setTasks(Array.isArray(response.data) ? response.data : [])).catch(() => setTasks([]))
    api.get('/submissions').then(response => {
      const data = Array.isArray(response.data) ? response.data : []
      setSubmissions(data)
    }).catch(() => setSubmissions([]))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const openTaskId = sessionStorage.getItem('openTaskDetail')
    if (openTaskId && tasks.length > 0) {
      const taskId = Number(openTaskId)
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        setTimeout(() => {
          handleTaskDetailOpen(task)
        }, 100)
      }
      sessionStorage.removeItem('openTaskDetail')
    }
  }, [tasks])

  const calcPeriods = (task: TaskItem) => {
    const basePeriods = calcBasePeriods(task)
    const now = new Date()
    return basePeriods.map(p => ({
      ...p,
      isCurrent: now >= p.startDate && now <= p.endDate
    }))
  }

  const fmtDate = (d: Date) => {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    return y + '/' + m + '/' + day
  }

  const getSubInPeriod = (taskId: number, weekIndex: number) => {
    return submissions.find(s => Number(s.task_id) === taskId && (s.week_number || 1) === weekIndex)
  }

  const activeTasks = tasks.filter(task => getDeadlineTime(task.end_date) >= Date.now())
  const completedTasks = tasks.filter(task => getDeadlineTime(task.end_date) < Date.now())

  const handleTaskDetailOpen = (task: TaskItem) => {
    setCurrentTask(task)
    const taskSubs = submissions.filter(s => Number(s.task_id) === task.id)
    setTaskSubmissions(taskSubs)
    setTaskDetailOpen(true)
  }

  const handleWeekClick = (sub: SubmissionItem | null, task: TaskItem, weekIndex: number) => {
    navigate(`/student/submit/${task.id}?week=${weekIndex}`)
  }

  const getStatusIcon = (sub: SubmissionItem | null | undefined, isPast: boolean, isFuture: boolean) => {
    if (isFuture) return null
    if (!sub) {
      return <MinusCircleOutlined style={{ fontSize: 14, color: 'var(--icon-unsubmitted)', opacity: 0.5 }} />
    }
    const status = sub.check_status
    if (status === 'approved') {
      return <CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />
    }
    if (status === 'rejected') {
      return (
        <div style={{ position: 'relative' }}>
          <CloseCircleOutlined style={{ fontSize: 14, color: '#ff4d4f' }} />
          <EditOutlined 
            style={{ 
              fontSize: 10, 
              color: '#fff', 
              position: 'absolute', 
              top: -4, 
              right: -4, 
              background: '#ff4d4f', 
              borderRadius: '50%', 
              padding: '1px' 
            }} 
          />
        </div>
      )
    }
    return <ClockCircleOutlined style={{ fontSize: 14, color: '#faad14' }} />
  }

  const getStatusTag = (sub: SubmissionItem | null | undefined) => {
    if (!sub) return null
    const status = sub.check_status
    return (
      <Tag
        color={status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning'}
        style={{ marginLeft: 4, fontSize: 10 }}
      >
        {status === 'approved' ? '通过' : status === 'rejected' ? '未通过' : '待审核'}
      </Tag>
    )
  }

  const hasRemark = (submission: SubmissionItem): boolean => {
    return Boolean(submission.check_remark && submission.check_remark.length > 0)
  }

  const handleDownloadFile = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openPdfPreview = (submission: SubmissionItem) => {
    setPdfPreviewSubmission(submission)
  }

  const renderTaskGrid = (task: TaskItem, taskIndex: number) => {
    const periods = calcPeriods(task)
    if (periods.length === 0) return null

    const taskSubs = submissions.filter(s => Number(s.task_id) === task.id)
    const submittedCount = taskSubs.length
    const approvedCount = taskSubs.filter(s => s.check_status === 'approved').length
    const pendingCount = taskSubs.filter(s => s.check_status === 'pending').length
    const rejectedCount = taskSubs.filter(s => s.check_status === 'rejected').length
    const withRemarkCount = taskSubs.filter(s => hasRemark(s)).length
    const progressPercent = periods.length > 0 ? Math.round((submittedCount / periods.length) * 100) : 0

    const weeksPerGroup = 10
    const groups: typeof periods[] = []
    for (let i = 0; i < periods.length; i += weeksPerGroup) {
      groups.push(periods.slice(i, i + weeksPerGroup))
    }
    const now = new Date()

    const renderWeekTh = (p: { index: number; startDate: Date; endDate: Date; isCurrent: boolean }) => (
      <th key={p.index} className={p.isCurrent ? 'current-week-col' : ''}>
        <div style={{ lineHeight: 1.3, fontSize: 12 }}>{'第' + p.index + '周'}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fmtDate(p.startDate)}<br/>至{fmtDate(p.endDate)}</div>
      </th>
    )

    const renderWeekTd = (p: { index: number; startDate: Date; endDate: Date; isCurrent: boolean }) => {
      const isPast = now > p.endDate
      const isFuture = now < p.startDate
      const cls = p.isCurrent ? 'current-week-col' : ''
      if (isFuture) return <td key={p.index} className={cls}></td>
      const sub = getSubInPeriod(task.id, p.index)
      if (isPast && !sub) {
        return (
          <td key={p.index} className={cls}>
            <MinusCircleOutlined style={{ fontSize: 14, color: 'var(--icon-unsubmitted)', opacity: 0.5 }} />
          </td>
        )
      }
      if (!sub) {
        return (
          <td
            key={p.index}
            className={cls}
            style={{ cursor: 'pointer' }}
            onClick={() => handleWeekClick(null, task, p.index)}
          >
            <PlusCircleOutlined style={{ fontSize: 14, color: 'var(--primary-color)' }} />
          </td>
        )
      }
      const isRejected = sub.check_status === 'rejected'
      return (
        <td
          key={p.index}
          className={cls}
          style={{ 
            cursor: 'pointer',
            backgroundColor: isRejected ? 'rgba(255, 77, 79, 0.08)' : undefined,
            borderRadius: isRejected ? '4px' : undefined
          }}
          onClick={() => handleWeekClick(sub, task, p.index)}
        >
          {getStatusIcon(sub, isPast, isFuture)}
          {getStatusTag(sub)}
          <div style={{ fontSize: 10, color: isRejected ? '#ff4d4f' : 'var(--text-tertiary)', marginTop: 2 }}>
            {isRejected ? '点击修改' : '点击编辑'}
          </div>
        </td>
      )
    }

    const padTh = (count: number, key: string) =>
      Array.from({ length: count }, (_, i) => <th key={`${key}-${i}`}></th>)

    const padTd = (count: number, key: string) =>
      Array.from({ length: count }, (_, i) => <td key={`${key}-${i}`}></td>)

    return (
      <div>
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            提交进度：<span style={{ fontWeight: 500, color: 'var(--primary-color)' }}>{submittedCount}/{periods.length}</span> 周
          </span>
          <Progress percent={progressPercent} size="small" style={{ width: 120, margin: 0 }} />
          <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#52c41a' }}><CheckCircleOutlined style={{ marginRight: 2 }} />通过 {approvedCount}</span>
            <span style={{ color: '#faad14' }}><ClockCircleOutlined style={{ marginRight: 2 }} />待审核 {pendingCount}</span>
            <span style={{ color: '#ff4d4f' }}><CloseCircleOutlined style={{ marginRight: 2 }} />未通过 {rejectedCount}</span>
            {withRemarkCount > 0 && (
              <span style={{ color: '#1890ff' }}><ExclamationCircleOutlined style={{ marginRight: 2 }} />有评语 {withRemarkCount}</span>
            )}
          </div>
        </div>
        {groups.map((group, gi) => {
          const groupStart = gi * weeksPerGroup + 1
          const groupEnd = groupStart + group.length - 1
          return (
            <div key={gi} style={{ marginBottom: gi < groups.length - 1 ? 16 : 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                第{groupStart}{groupEnd !== groupStart ? `-${groupEnd}` : ''}周
              </div>
              <div className="table-scroll">
                <table className="twl-table">
                  <thead>
                    <tr>
                      {group.map(renderWeekTh)}
                      {group.length < weeksPerGroup && padTh(weeksPerGroup - group.length, `hpad${gi}`)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {group.map(renderWeekTd)}
                      {group.length < weeksPerGroup && padTd(weeksPerGroup - group.length, `dpad${gi}`)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const completedColumns: ColumnsType<TaskItem> = [
    { title: '序号', key: 'index', width: 50, align: 'center', render: (_, __, i) => i + 1 },
    {
      title: '任务名称',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, task: TaskItem) => (
        <a onClick={() => handleTaskDetailOpen(task)} style={{ color: 'var(--primary-color)', cursor: 'pointer' }}>
          {text}
        </a>
      )
    },
    { title: '截止日期', key: 'end_date', width: 100, align: 'center', render: (_, task: TaskItem) => formatDate(task.end_date) },
    { title: '类型', key: 'type', width: 80, align: 'center', render: (_, task: TaskItem) => <Tag color={getTagColor(task.type)}>{getTypeLabel(task.type)}</Tag> },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, task: TaskItem) => (
        <Button type="default" shape="circle" size="small" icon={<EyeOutlined />} onClick={() => handleTaskDetailOpen(task)} title="查看详情" />
      )
    }
  ]

  return (
    <div className="page-shell">
      <Card className="compact-card" title={<span style={{ fontWeight: 600 }}>我的任务</span>}>
        {activeTasks.length === 0 ? (
          <Empty description="暂无进行中的任务" />
        ) : (
          activeTasks.map((task, i) => (
            <Card key={task.id} className="compact-card" style={{ marginBottom: 16 }} title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>第{i + 1}项任务：{task.title}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  下达: {formatDate(task.create_time)} | 截止: {formatDate(task.end_date)} | {getTypeLabel(task.type)}
                </span>
              </div>
            }>
              {renderTaskGrid(task, i + 1)}
            </Card>
          ))
        )}
      </Card>

      {completedTasks.length > 0 && (
        <Card className="compact-card section-gap" title={<span style={{ fontWeight: 600 }}>已结束任务</span>}>
          <Table
            rowKey="id"
            size="small"
            dataSource={completedTasks}
            columns={completedColumns}
          />
        </Card>
      )}

      <Modal open={taskDetailOpen} title="任务详情" footer={null} onCancel={() => setTaskDetailOpen(false)} width={800}>
        {currentTask && (
          <div className="detail-pane">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="任务名称">{currentTask.title}</Descriptions.Item>
              <Descriptions.Item label="任务ID">{currentTask.id}</Descriptions.Item>
              <Descriptions.Item label="类型"><Tag color={getTagColor(currentTask.type)}>{getTypeLabel(currentTask.type)}</Tag></Descriptions.Item>
              <Descriptions.Item label="下达日期">{formatDate(currentTask.create_time)}</Descriptions.Item>
              <Descriptions.Item label="截止日期">{formatDate(currentTask.end_date)}</Descriptions.Item>
            </Descriptions>
            <div className="detail-block">
              <h4>任务内容</h4>
              <div className="detail-box" dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(currentTask.content) || '无' }} />
            </div>
            {currentTask.doc_file_url && (
              <div className="detail-block">
                <h4>任务附件</h4>
                <div className="detail-box">
                  <a href={currentTask.doc_file_url} target="_blank" rel="noreferrer">
                    {currentTask.doc_name || currentTask.doc_file_url.split('/').pop() || '任务附件'}
                  </a>
                </div>
              </div>
            )}
            <div className="detail-block">
              <h4>我的提交记录（共 {taskSubmissions.length} 条）</h4>
              {taskSubmissions.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', padding: '12px 0', textAlign: 'center' }}>
                  暂无提交记录
                </div>
              ) : (
                <div className="detail-box">
                  {taskSubmissions.sort((a, b) => Number(a.week_number || 1) - Number(b.week_number || 1)).map((sub, idx) => (
                    <div key={sub.id} style={{
                      marginBottom: idx < taskSubmissions.length - 1 ? 16 : 0,
                      paddingBottom: idx < taskSubmissions.length - 1 ? 16 : 0,
                      borderBottom: idx < taskSubmissions.length - 1 ? '1px solid var(--border-color)' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500 }}>第{sub.week_number || 1}周</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{formatDateTime(sub.submit_time)}</span>
                        <Tag color={getReviewTagColor(sub.check_status)}>{reviewStatusLabels[sub.check_status]}</Tag>
                        {hasRemark(sub) && <Tag color="blue">有评语</Tag>}
                        <Button
                          type="link"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setTaskDetailOpen(false)
                            navigate(`/student/submit/${currentTask.id}?week=${sub.week_number || 1}`)
                          }}
                        >
                          编辑
                        </Button>
                      </div>
                      {(() => {
                        const fileMeta = getSubmissionFileMeta(sub)
                        if (fileMeta) {
                          return (
                            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ fontWeight: 500, fontSize: 13 }}>提交附件：</span>
                                <a href={fileMeta.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {renderFileTypeIcon(fileMeta.name)}
                                  <span>{fileMeta.name}</span>
                                </a>
                              </div>
                              {isPdfFile(fileMeta.url) && (
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <Button
                                    size="small"
                                    icon={<EyeOutlined />}
                                    onClick={() => openPdfPreview(sub)}
                                  >
                                    预览PDF
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<FullscreenOutlined />}
                                    onClick={() => openPdfPreview(sub)}
                                  >
                                    全屏查看
                                  </Button>
                                  <Button
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    onClick={() => handleDownloadFile(fileMeta.url, fileMeta.name)}
                                  >
                                    下载
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        }
                        return null
                      })()}
                      {hasRemark(sub) ? (
                        <div style={{ padding: 12, background: 'var(--bg-soft)', borderRadius: 8, marginTop: 8 }}>
                          <div style={{ fontSize: 12, color: 'var(--primary-color)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ExclamationCircleOutlined /> <strong>导师评语</strong>{sub.check_time ? `（${formatDateTime(sub.check_time)}）` : ''}
                          </div>
                          <div dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(sub.check_remark) }} />
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                          <ClockCircleOutlined /> 等待导师审核...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!pdfPreviewSubmission}
        title="PDF预览"
        width={900}
        footer={null}
        onCancel={() => setPdfPreviewSubmission(null)}
      >
        {pdfPreviewSubmission && (() => {
          const fileMeta = getSubmissionFileMeta(pdfPreviewSubmission)
          if (!fileMeta || !isPdfFile(fileMeta.url)) {
            return <div style={{ padding: 40, textAlign: 'center' }}>该文件不是PDF格式</div>
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: 6 }}>
                <span style={{ fontWeight: 500 }}>{renderFileTypeIcon(fileMeta.name)} {fileMeta.name}</span>
                <div style={{ flex: 1 }} />
                <Button size="small" icon={<FullscreenOutlined />} onClick={() => setPdfFullscreen(true)}>全屏查看</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(fileMeta.url, fileMeta.name)}>下载</Button>
              </div>
              <iframe
                src={fileMeta.url}
                style={{ width: '100%', height: 600, border: '1px solid var(--border-color)', borderRadius: 6 }}
                title="PDF预览"
              />
            </div>
          )
        })()}
      </Modal>

      {pdfFullscreen && pdfPreviewSubmission && (() => {
        const fileMeta = getSubmissionFileMeta(pdfPreviewSubmission)
        if (!fileMeta || !isPdfFile(fileMeta.url)) return null
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: 'var(--bg-page)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 24px',
              background: 'var(--bg-soft)',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <span style={{ fontWeight: 500, fontSize: 16 }}>{renderFileTypeIcon(fileMeta.name)} {fileMeta.name}</span>
              <div style={{ flex: 1 }} />
              <Button icon={<DownloadOutlined />} onClick={() => handleDownloadFile(fileMeta.url, fileMeta.name)}>下载</Button>
              <Button icon={<FullscreenExitOutlined />} onClick={() => setPdfFullscreen(false)}>退出全屏</Button>
            </div>
            <iframe
              src={fileMeta.url}
              style={{ flex: 1, border: 'none' }}
              title="PDF全屏查看"
            />
          </div>
        )
      })()}
    </div>
  )
}