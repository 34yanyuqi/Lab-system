import { useState, useCallback, useEffect, useMemo } from 'react'
import { Card, Table, Tabs, Empty, Button, Modal, Descriptions, Tag, Progress, Grid } from 'antd'
import { EyeOutlined, MinusCircleOutlined, CheckCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '@/api'
import { formatDate, formatDateTime, calcPeriods as calcBasePeriods } from '@/utils/format'
import { getTypeLabel, getReviewTagColor, reviewStatusLabels } from '@/config'
import { renderAttachmentLink, renderTaskDocumentLink } from '@/utils/file'
import { formatRichTextForDisplay, getTextPreview } from '@/utils/richText'
import type { TaskItem, StudentItem, SubmissionItem } from '@/types'

const { useBreakpoint } = Grid

export default function TeacherCheckPage() {
  const [activeTab, setActiveTab] = useState('active')
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])
  const [students, setStudents] = useState<StudentItem[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [currentSubmission, setCurrentSubmission] = useState<SubmissionItem | null>(null)
  const [reqModalOpen, setReqModalOpen] = useState(false)
  const [currentTaskForReq, setCurrentTaskForReq] = useState<TaskItem | null>(null)
  const [weekModalOpen, setWeekModalOpen] = useState(false)
  const [weekModalTitle, setWeekModalTitle] = useState('')
  const [weekModalSubs, setWeekModalSubs] = useState<SubmissionItem[]>([])
  const [remarkModalOpen, setRemarkModalOpen] = useState(false)
  const [remarkModalTitle, setRemarkModalTitle] = useState('')
  const [remarkStudentId, setRemarkStudentId] = useState<number>(0)
  const [remarkTaskId, setRemarkTaskId] = useState<number>(0)

  const screens = useBreakpoint()
  const isMobile = !screens.md

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
    const openSubmissionId = sessionStorage.getItem('openSubmissionId')
    if (openSubmissionId && submissions.length > 0) {
      const subId = Number(openSubmissionId)
      const submission = submissions.find(s => s.id === subId)
      if (submission) {
        setTimeout(() => {
          setCurrentSubmission(submission)
          setDetailOpen(true)
        }, 100)
      }
      sessionStorage.removeItem('openSubmissionId')
    }
  }, [submissions])

  // 注意：不能在 useCallback 外捕获 now，否则任务截止后状态不会更新
  const isTaskActive = useCallback((task: TaskItem) => {
    const endDate = new Date(task.end_date + 'T23:59:59')
    return task.status === 'active' && endDate >= new Date()
  }, [])

  const activeTasks = useMemo(() => tasks.filter(isTaskActive), [tasks, isTaskActive])
  const completedTasks = useMemo(() => tasks.filter(t => !isTaskActive(t)), [tasks, isTaskActive])

  const getTaskStudentIds = (task: TaskItem): number[] => {
    try { return JSON.parse(String(task.student_ids || '[]')) } catch { return [] }
  }

  const getTaskStudents = (task: TaskItem) => {
    const ids = getTaskStudentIds(task)
    return students.filter(s => ids.includes(s.id))
  }

  const fmtDate = (d: Date) => {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const day = d.getDate()
    return y + '/' + m + '/' + day
  }

  const calcPeriods = (task: TaskItem) => {
    const basePeriods = calcBasePeriods(task)
    const now = new Date()
    return basePeriods.map(p => ({
      ...p,
      label: `第${p.index}周(${fmtDate(p.startDate)}-${fmtDate(p.endDate)})`,
      isCurrent: now >= p.startDate && now <= p.endDate
    }))
  }

  const getSubInPeriod = (taskId: number, studentId: number, pStart: Date, pEnd: Date) => {
    return submissions.find(s => {
      if (Number(s.task_id) !== taskId || Number(s.student_id) !== studentId) return false
      const st = new Date(String(s.submit_time).replace(' ', 'T'))
      return st >= pStart && st <= pEnd
    })
  }

  const showWeekDetail = (studentName: string, weekLabel: string, taskId: number, studentId: number, pStart: Date, pEnd: Date) => {
    const subs = submissions.filter(s => {
      if (Number(s.task_id) !== taskId || Number(s.student_id) !== studentId) return false
      const st = new Date(String(s.submit_time).replace(' ', 'T'))
      return st >= pStart && st <= pEnd
    })
    setWeekModalTitle(studentName + ' - ' + weekLabel.replace('\n', ' '))
    setWeekModalSubs(subs)
    setWeekModalOpen(true)
  }

  const showRemarkTimeline = (taskId: number, taskTitle: string, studentName: string, studentId: number) => {
    setRemarkModalTitle(`${studentName} - ${taskTitle}`)
    setRemarkStudentId(studentId)
    setRemarkTaskId(taskId)
    setRemarkModalOpen(true)
  }

  const renderStudentCard = (task: TaskItem, taskIndex: number, student: any, periods: any[]) => {
    const now = new Date()
    const passedPeriods = periods.filter((p: any) => now >= p.startDate)
    const totalPeriods = passedPeriods.length
    let submitted = 0
    passedPeriods.forEach((p: any) => {
      if (getSubInPeriod(task.id, student.id, p.startDate, p.endDate)) submitted++
    })
    const percent = totalPeriods > 0 ? Math.round(submitted / totalPeriods * 100) : 0
    const color = percent >= 100 ? '#22c55e' : percent < 50 ? '#ef4444' : '#f59e0b'

    return (
      <div key={student.id} className="check-mobile-card">
        <div className="check-mobile-card-header">
          <div className="check-mobile-student">
            <span className="check-mobile-student-id">{student.student_id}</span>
            <span className="check-mobile-student-name">{student.username}</span>
          </div>
          <div className="check-mobile-progress">
            <Progress
              percent={percent}
              strokeColor={color}
              trailColor="var(--border-color)"
              strokeLinecap="square"
              size={[80, 12]}
              format={() => `${percent}%`}
            />
            <span className="check-mobile-progress-text">{submitted}/{totalPeriods} 周</span>
          </div>
        </div>
        <div className="check-mobile-weeks">
          {periods.map((p: any) => {
            const sub = getSubInPeriod(task.id, student.id, p.startDate, p.endDate)
            return (
              <div
                key={p.index}
                className={`check-mobile-week ${p.isCurrent ? 'current' : ''} ${sub ? 'submitted' : ''}`}
                onClick={() => {
                  if (sub) {
                    setCurrentSubmission(sub)
                    setDetailOpen(true)
                  } else {
                    showWeekDetail(student.username, '第' + p.index + '周', task.id, student.id, p.startDate, p.endDate)
                  }
                }}
              >
                <span className="check-mobile-week-label">第{p.index}周</span>
                <span className="check-mobile-week-date">{fmtDate(p.startDate)}-{fmtDate(p.endDate)}</span>
                {sub ? (
                  <CheckCircleOutlined style={{ color: '#22c55e', fontSize: 16 }} />
                ) : (
                  <MinusCircleOutlined style={{ color: 'var(--icon-unsubmitted)', fontSize: 16 }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderTaskCard = (task: TaskItem, taskIndex: number) => {
    const taskStudents = getTaskStudents(task)
    const periods = calcPeriods(task)

    if (isMobile) {
      return (
        <Card key={task.id} className="compact-card check-task-card" style={{ marginBottom: 16 }} title={
          <div className="check-task-card-title">
            <div className="check-task-card-title-main">
              <span className="check-task-card-index">第{taskIndex}项任务：{task.title}</span>
            </div>
            <div className="check-task-card-title-info">
              <span>下达: {formatDate(task.create_time)}</span>
              <span>截止: {formatDate(task.end_date)}</span>
              <span>频次: {task.check_frequency}天</span>
              <span>{getTypeLabel(task.type)}</span>
            </div>
            <div className="check-task-card-title-actions">
              <Button size="small" onClick={() => { setCurrentTaskForReq(task); setReqModalOpen(true) }}>具体要求</Button>
            </div>
          </div>
        }>
          {taskStudents.length === 0 ? <Empty description="暂无分配学生" /> : (
            <div className="check-mobile-list">
              {taskStudents.map(s => renderStudentCard(task, taskIndex, s, periods))}
            </div>
          )}
        </Card>
      )
    }

    const weekColumns: ColumnsType<any> = [
      {
        title: '学号', dataIndex: 'student_id', key: 'student_id', width: 40, fixed: 'left', ellipsis: true, align: 'center' as const
      },
      {
        title: '姓名', dataIndex: 'username', key: 'username', width: 40, fixed: 'left', ellipsis: true, align: 'center' as const
      },
      {
        title: '完成率', key: 'progress', width: 100, fixed: 'left', align: 'center' as const,
        render: (_: any, row: any) => {
          const now = new Date()
          const passedPeriods = periods.filter(p => now >= p.startDate)
          const totalPeriods = passedPeriods.length
          let submitted = 0
          passedPeriods.forEach(p => {
            if (getSubInPeriod(task.id, row.id, p.startDate, p.endDate)) submitted++
          })
          const percent = totalPeriods > 0 ? Math.round(submitted / totalPeriods * 100) : 0
          const color = percent >= 100 ? '#22c55e' : percent < 50 ? '#ef4444' : '#f59e0b'
          return (
            <div>
              <Progress
                percent={percent}
                strokeColor={color}
                trailColor="var(--border-color)"
                strokeLinecap="square"
                size={[100, 14]}
                format={() => `${percent}%`}
              />
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{submitted}/{totalPeriods} 周</div>
            </div>
          )
        }
      },
      {
        title: '评语', key: 'remark', width: 60, fixed: 'left', align: 'center' as const,
        render: (_: any, row: any) => {
          const studentSubs = submissions.filter(s => Number(s.student_id) === row.id && Number(s.task_id) === task.id && s.check_remark)
          const hasRemark = studentSubs.length > 0
          return (
            <EyeOutlined 
              style={{ 
                fontSize: 16, 
                color: hasRemark ? '#6366f1' : 'var(--icon-unsubmitted)', 
                cursor: hasRemark ? 'pointer' : 'default' 
              }}
              onClick={() => {
                if (hasRemark) {
                  showRemarkTimeline(task.id, task.title, row.username, row.id)
                }
              }}
              title={hasRemark ? '查看评语' : '暂无评语'}
            />
          )
        }
      }
    ]

    periods.forEach(p => {
      weekColumns.push({
        title: <div style={{ textAlign: 'center', lineHeight: 1.4 }}><div>{'第' + p.index + '周'}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDate(p.startDate)} 至 {fmtDate(p.endDate)}</div></div>,
        key: 'week' + p.index,
        width: 60,
        align: 'center' as const,
        className: p.isCurrent ? 'current-week-col' : '',
        render: (_: any, row: any) => {
          const sub = getSubInPeriod(task.id, row.id, p.startDate, p.endDate)
          if (!sub) {
            return (
              <MinusCircleOutlined style={{ fontSize: 16, color: 'var(--icon-unsubmitted)', cursor: 'pointer' }}
                onClick={() => showWeekDetail(row.username, '第' + p.index + '周', task.id, row.id, p.startDate, p.endDate)} />
            )
          }
          return (
            <div>
              <EyeOutlined style={{ fontSize: 14, color: 'var(--icon-submitted)', cursor: 'pointer' }}
                onClick={() => { setCurrentSubmission(sub); setDetailOpen(true) }} />
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{formatDateTime(sub.submit_time)}</div>
            </div>
          )
        }
      })
    })

    return (
      <Card key={task.id} className="compact-card check-task-card" style={{ marginBottom: 24 }} title={
        <div className="check-task-card-title-desktop">
          <div>
            <span style={{ fontWeight: 600, fontSize: 15 }}>第{taskIndex}项任务：{task.title}</span>
            <span style={{ marginLeft: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              下达: {formatDate(task.create_time)} | 截止: {formatDate(task.end_date)} | 频次: {task.check_frequency}天 | {getTypeLabel(task.type)}
            </span>
          </div>
          <Button size="small" onClick={() => { setCurrentTaskForReq(task); setReqModalOpen(true) }}>具体要求</Button>
        </div>
      }>
        <Table
          rowKey="id"
          columns={weekColumns}
          dataSource={taskStudents}
          size="small"
          pagination={false}
          scroll={{ x: Math.max(300, weekColumns.length * 120) }}
          locale={{ emptyText: <Empty description="暂无分配学生" /> }}
        />
      </Card>
    )
  }

  const detailColumns: ColumnsType<SubmissionItem> = isMobile
    ? [
        { title: '提交时间', key: 't', width: 120, render: (_: any, r: SubmissionItem) => formatDateTime(r.submit_time) },
        { title: '状态', key: 's', width: 70, render: (_: any, r: SubmissionItem) => <Tag color={getReviewTagColor(r.check_status)}>{reviewStatusLabels[r.check_status]}</Tag> },
        { title: '操作', key: 'a', width: 60, align: 'center' as const, render: (_: any, r: SubmissionItem) => <Button type="default" shape="circle" size="small" icon={<EyeOutlined />} onClick={() => { setCurrentSubmission(r); setWeekModalOpen(false); setTimeout(() => setDetailOpen(true), 100) }} title="详情" /> }
      ]
    : [
        { title: '提交时间', key: 't', width: 160, render: (_: any, r: SubmissionItem) => formatDateTime(r.submit_time) },
        { title: '提交内容', key: 'c', ellipsis: true, render: (_: any, r: SubmissionItem) => getTextPreview(r.submit_content || '') },
        { title: '附件', key: 'f', width: 200, render: (_: any, r: SubmissionItem) => renderAttachmentLink(r) },
        { title: '状态', key: 's', width: 80, render: (_: any, r: SubmissionItem) => <Tag color={getReviewTagColor(r.check_status)}>{reviewStatusLabels[r.check_status]}</Tag> },
        { title: '操作', key: 'a', width: 80, align: 'center' as const, render: (_: any, r: SubmissionItem) => <Button type="default" shape="circle" size="small" icon={<EyeOutlined />} onClick={() => { setCurrentSubmission(r); setWeekModalOpen(false); setTimeout(() => setDetailOpen(true), 100) }} title="详情" /> }
      ]

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="card-head"></div>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab={'进行中任务 (' + activeTasks.length + ')'} key="active">
            {activeTasks.length === 0 ? <Empty description="暂无进行中的任务" /> : activeTasks.map((task, i) => renderTaskCard(task, i + 1))}
          </Tabs.TabPane>
          <Tabs.TabPane tab={'已完成任务 (' + completedTasks.length + ')'} key="completed">
            {completedTasks.length === 0 ? <Empty description="暂无已完成的任务" /> : completedTasks.map((task, i) => renderTaskCard(task, i + 1))}
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <Modal open={detailOpen} title="提交详情" width={isMobile ? '100%' : 780} footer={null} onCancel={() => setDetailOpen(false)} style={isMobile ? { maxWidth: '100vw', top: 0, paddingBottom: 0 } : undefined}>
        {currentSubmission && (
          <div className="detail-pane">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务标题">{currentSubmission.task_title}</Descriptions.Item>
              <Descriptions.Item label="学号">{currentSubmission.student_school_id}</Descriptions.Item>
              <Descriptions.Item label="提交时间">{formatDateTime(currentSubmission.submit_time)}</Descriptions.Item>
              <Descriptions.Item label="附件">{currentSubmission.submit_file ? '已上传附件' : '未上传附件'}</Descriptions.Item>
              <Descriptions.Item label="审核状态">
                <Tag color={getReviewTagColor(currentSubmission.check_status)}>
                  {reviewStatusLabels[currentSubmission.check_status]}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <div className="detail-block">
              <h4>提交内容</h4>
              <div className="detail-box" dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(currentSubmission.submit_content) || '无' }} />
            </div>
            <div className="detail-block">
              <h4>附件</h4>
              <div className="detail-box">{renderAttachmentLink(currentSubmission)}</div>
            </div>
            {currentSubmission.check_remark && (
              <div className="detail-block">
                <h4>审核意见{currentSubmission.check_time ? `（${formatDateTime(currentSubmission.check_time)}）` : ''}</h4>
                <div className="detail-box" dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(currentSubmission.check_remark) }} />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={reqModalOpen} title="任务要求" width={isMobile ? '100%' : 640} footer={null} onCancel={() => setReqModalOpen(false)} style={isMobile ? { maxWidth: '100vw', top: 0, paddingBottom: 0 } : undefined}>
        {currentTaskForReq && (
          <div style={{ padding: 8 }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务标题">{currentTaskForReq.title}</Descriptions.Item>
              <Descriptions.Item label="任务类型">{getTypeLabel(currentTaskForReq.type)}</Descriptions.Item>
              <Descriptions.Item label="截止日期">{formatDate(currentTaskForReq.end_date)}</Descriptions.Item>
              <Descriptions.Item label="检查频次">{currentTaskForReq.check_frequency}天</Descriptions.Item>
            </Descriptions>
            <div className="detail-block" style={{ marginTop: 16 }}>
              <h4>任务内容</h4>
              <div className="detail-box" dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(currentTaskForReq.content) || '无' }} />
            </div>
            {currentTaskForReq.doc_name && (
              <div className="detail-block" style={{ marginTop: 16 }}>
                <h4>任务附件</h4>
                <div className="detail-box">{renderTaskDocumentLink(currentTaskForReq)}</div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={weekModalOpen} title={weekModalTitle} width={isMobile ? '100%' : 720} footer={null} onCancel={() => setWeekModalOpen(false)} style={isMobile ? { maxWidth: '100vw', top: 0, paddingBottom: 0 } : undefined}>
        <Table
          rowKey="id"
          dataSource={weekModalSubs}
          size="small"
          pagination={false}
          locale={{ emptyText: <Empty description="该时段内无提交记录" /> }}
          columns={detailColumns}
          scroll={isMobile ? { x: 280 } : undefined}
        />
      </Modal>

      <Modal open={remarkModalOpen} title={remarkModalTitle} width={isMobile ? '100%' : 680} footer={null} onCancel={() => setRemarkModalOpen(false)} style={isMobile ? { maxWidth: '100vw', top: 0, paddingBottom: 0 } : undefined}>
        <div className="remark-timeline-container">
          {(() => {
            const taskSubmissions = submissions.filter(s => Number(s.student_id) === remarkStudentId && Number(s.task_id) === remarkTaskId && s.check_remark).sort((a, b) => {
              return new Date(String(b.check_time || b.submit_time)).getTime() - new Date(String(a.check_time || a.submit_time)).getTime()
            })
            
            if (taskSubmissions.length === 0) {
              return <Empty description="暂无评语" />
            }

            return (
              <div className="remark-timeline">
                {taskSubmissions.map((sub, index) => (
                  <div key={sub.id} className="remark-timeline-item">
                    <div className="remark-timeline-line">
                      <div className={`remark-timeline-dot ${index === 0 ? 'first' : ''}`}></div>
                      {index < taskSubmissions.length - 1 && <div className="remark-timeline-connector"></div>}
                    </div>
                    <div className="remark-timeline-content">
                        <div className="remark-timeline-header">
                          <div className="remark-timeline-meta">
                            <span className="remark-timeline-date">{formatDateTime(sub.check_time || sub.submit_time)}</span>
                            {sub.week_number && <span className="remark-timeline-week">第{sub.week_number}周</span>}
                          </div>
                          <Tag color={getReviewTagColor(sub.check_status)}>{reviewStatusLabels[sub.check_status]}</Tag>
                        </div>
                        <div className="remark-timeline-body" dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(sub.check_remark || '') }} />
                      </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        <style>{`
          .remark-timeline-container {
            padding: 16px 0;
            max-height: 500px;
            overflow-y: auto;
          }
          .remark-timeline {
            position: relative;
          }
          .remark-timeline-item {
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
          }
          .remark-timeline-item:last-child {
            margin-bottom: 0;
          }
          .remark-timeline-line {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 24px;
            flex-shrink: 0;
          }
          .remark-timeline-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--border-color);
            border: 3px solid var(--bg-card);
            box-shadow: 0 0 0 2px var(--border-color);
          }
          .remark-timeline-dot.first {
            background: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
          }
          .remark-timeline-connector {
            flex: 1;
            width: 2px;
            background: linear-gradient(to bottom, var(--border-color), transparent);
            margin-top: 8px;
          }
          .remark-timeline-content {
            flex: 1;
            padding: 12px 16px;
            background: var(--background-color);
            border-radius: 8px;
            border: 1px solid var(--border-color);
          }
          .remark-timeline-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
          }
          .remark-timeline-meta {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .remark-timeline-date {
            color: var(--text-secondary);
          }
          .remark-timeline-week {
            display: inline-block;
            padding: 2px 8px;
            background: rgba(99, 102, 241, 0.1);
            color: #6366f1;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
          }
          .remark-timeline-body {
            font-size: 14px;
            line-height: 1.6;
            color: var(--text-primary);
            white-space: pre-wrap;
            word-break: break-word;
          }
        `}</style>
      </Modal>
    </div>
  )
}
