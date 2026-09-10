import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Statistic, Progress, List, Tag, Button, Typography, Empty } from 'antd'
import {
  FileTextOutlined, CheckCircleOutlined, ClockCircleOutlined,
  CloseCircleOutlined, BellOutlined, SendOutlined, ExclamationCircleOutlined,
  DashboardOutlined, ArrowRightOutlined, FileDoneOutlined, DesktopOutlined
} from '@ant-design/icons'
import api from '@/api'
import { useAuth } from '@/contexts'
import { useNotification } from '@/contexts/NotificationContext'
import type { TaskItem, SubmissionItem } from '@/types'
import type { Notification } from '@/contexts/NotificationContext'
import { formatDate, getRemainingDays, getRemainingDaysLabel, calcPeriods } from '@/utils/format'
import { getTypeLabel, getTagColor, getReviewTagColor, reviewStatusLabels } from '@/config'

const { Text, Paragraph } = Typography

export default function StudentHomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { notifications } = useNotification()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([])

  const loadData = useCallback(() => {
    api.get('/tasks').then(res => setTasks(Array.isArray(res.data) ? res.data : [])).catch(() => setTasks([]))
    api.get('/submissions').then(res => setSubmissions(Array.isArray(res.data) ? res.data : [])).catch(() => setSubmissions([]))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const now = Date.now()
  const activeTasks = tasks.filter(t => new Date(t.end_date + 'T23:59:59').getTime() >= now)
  const completedTasks = tasks.filter(t => new Date(t.end_date + 'T23:59:59').getTime() < now)
  const totalTasks = tasks.length
  const activeCount = activeTasks.length
  const submittedTaskIds = [...new Set(submissions.map(s => Number(s.task_id)))]
  const submittedCount = submittedTaskIds.filter(id => tasks.some(t => t.id === id)).length
  const unsubmittedCount = totalTasks - submittedCount
  const pendingCount = submissions.filter(s => s.check_status === 'pending').length
  const approvedCount = submissions.filter(s => s.check_status === 'approved').length
  const rejectedCount = submissions.filter(s => s.check_status === 'rejected').length
  const overallProgress = totalTasks > 0 ? Math.round((submittedCount / totalTasks) * 100) : 0

  const latestNotifications = notifications.slice(0, 5)

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_assign': return <FileTextOutlined style={{ color: '#1890ff' }} />
      case 'task_deadline': return <ClockCircleOutlined style={{ color: '#faad14' }} />
      case 'review_result': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      default: return <BellOutlined style={{ color: '#8c8c8c' }} />
    }
  }

  const handleNotificationClick = (item: Notification) => {
    if (item.type === 'task_assign') {
      navigate('/student/dashboard')
    } else if (item.type === 'review_result') {
      navigate('/student/dashboard')
      if (item.related_id) {
        sessionStorage.setItem('openTaskDetail', String(item.related_id))
      }
    }
  }

  const formatNotifTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return formatDate(dateStr)
  }

  const getDeadlineTagColor = (endDate: string) => {
    const days = getRemainingDays(endDate)
    if (days < 0) return 'default'
    if (days <= 3) return 'error'
    return 'success'
  }

  return (
    <div className="page-shell">
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              <DashboardOutlined style={{ marginRight: 8 }} />
              欢迎回来，{user?.username}
            </h2>
            <Text type="secondary">
              {user?.student_grade}级 · {user?.student_major || '未设置专业'}
            </Text>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<FileDoneOutlined />} onClick={() => navigate('/student/dashboard')}>
              我的任务
            </Button>
            <Button icon={<DesktopOutlined />} onClick={() => navigate('/student/equipments')}>
              设备管理
            </Button>
          </div>
        </div>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总任务数"
              value={totalTasks}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="进行中"
              value={activeCount}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="已提交"
              value={submittedCount}
              prefix={<SendOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="未提交"
              value={unsubmittedCount}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: unsubmittedCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="待审核"
              value={pendingCount}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="已通过"
              value={approvedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="已驳回"
              value={rejectedCount}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="整体完成度"
              value={overallProgress}
              suffix="%"
              prefix={
                <Progress
                  type="circle"
                  percent={overallProgress}
                  size={24}
                  strokeWidth={6}
                  strokeColor={{ '0%': '#1890ff', '100%': '#52c41a' }}
                  showInfo={false}
                />
              }
              valueStyle={{ color: overallProgress === 100 ? '#52c41a' : '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {activeTasks.length > 0 && (
        <Card
          title={<span style={{ fontWeight: 600, fontSize: 15 }}>进行中的任务</span>}
          style={{ marginBottom: 16 }}
          extra={
            <Button type="link" size="small" onClick={() => navigate('/student/dashboard')}>
              查看全部 <ArrowRightOutlined />
            </Button>
          }
        >
          {activeTasks.map((task, idx) => {
            const taskSubs = submissions.filter(s => Number(s.task_id) === task.id)
            // check_frequency 是"检查间隔天数"，不是周次总数：应按已开始的周期数计算进度
            const elapsedPeriods = calcPeriods(task).filter(p => new Date() >= p.startDate).length
            const expectedPeriods = Math.max(elapsedPeriods, 1)
            const taskProgress = Math.min(Math.round((taskSubs.length / expectedPeriods) * 100), 100)
            const taskApproved = taskSubs.filter(s => s.check_status === 'approved').length
            const taskPending = taskSubs.filter(s => s.check_status === 'pending').length
            const taskRejected = taskSubs.filter(s => s.check_status === 'rejected').length

            return (
              <div
                key={task.id}
                style={{
                  padding: '12px 0',
                  borderBottom: idx < activeTasks.length - 1 ? '1px solid var(--border-color)' : 'none',
                  cursor: 'pointer'
                }}
                onClick={() => navigate(`/student/dashboard`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>{task.title}</Text>
                    <Tag color={getTagColor(task.type)} style={{ marginLeft: 8 }}>{getTypeLabel(task.type)}</Tag>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(task.end_date)} 截止</Text>
                    <Tag color={getDeadlineTagColor(task.end_date)} style={{ fontSize: 11 }}>
                      {getRemainingDaysLabel(task.end_date)}
                    </Tag>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Progress
                    percent={taskProgress}
                    size="small"
                    style={{ flex: 1, margin: 0 }}
                    strokeColor={taskProgress === 100 ? '#52c41a' : '#1890ff'}
                  />
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#52c41a' }}><CheckCircleOutlined style={{ marginRight: 2 }} />{taskApproved}</span>
                    <span style={{ color: '#faad14' }}><ClockCircleOutlined style={{ marginRight: 2 }} />{taskPending}</span>
                    <span style={{ color: '#ff4d4f' }}><CloseCircleOutlined style={{ marginRight: 2 }} />{taskRejected}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>共{taskSubs.length}次提交</span>
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card
            title={<span style={{ fontWeight: 600, fontSize: 15 }}><BellOutlined style={{ marginRight: 6 }} />最新通知</span>}
            style={{ marginBottom: 16 }}
          >
            {latestNotifications.length === 0 ? (
              <Empty description="暂无通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                dataSource={latestNotifications}
                renderItem={(item: Notification) => (
                  <List.Item style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => handleNotificationClick(item)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                      <div style={{ marginTop: 3, flexShrink: 0 }}>{getNotificationIcon(item.type)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong style={{ fontSize: 13 }}>
                            {item.is_read === 0 && (
                              <span style={{
                                display: 'inline-block',
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#1890ff',
                                marginRight: 6,
                                verticalAlign: 'middle'
                              }} />
                            )}
                            {item.title}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{formatNotifTime(item.created_at)}</Text>
                        </div>
                        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }} ellipsis={{ rows: 2 }}>
                          {item.content}
                        </Paragraph>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={<span style={{ fontWeight: 600, fontSize: 15 }}>已结束任务</span>}
            style={{ marginBottom: 16 }}
            extra={
              completedTasks.length > 5 && (
                <Button type="link" size="small" onClick={() => navigate('/student/dashboard')}>
                  查看全部 <ArrowRightOutlined />
                </Button>
              )
            }
          >
            {completedTasks.length === 0 ? (
              <Empty description="暂无已结束的任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              completedTasks.slice(0, 5).map((task, idx) => {
                const taskSubs = submissions.filter(s => Number(s.task_id) === task.id)
                const taskApproved = taskSubs.filter(s => s.check_status === 'approved').length

                return (
                  <div
                    key={task.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: idx < Math.min(completedTasks.length, 5) - 1 ? '1px solid var(--border-color)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onClick={() => navigate(`/student/dashboard`)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text ellipsis style={{ display: 'block' }}>{task.title}</Text>
                      <div style={{ marginTop: 2 }}>
                        <Tag color={getTagColor(task.type)} style={{ fontSize: 11 }}>{getTypeLabel(task.type)}</Tag>
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                          {formatDate(task.end_date)} 截止
                        </Text>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                      <Tag color={taskSubs.length > 0 ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                        提交 {taskSubs.length}
                      </Tag>
                      <Tag color={taskApproved > 0 ? 'green' : 'default'} style={{ fontSize: 11 }}>
                        通过 {taskApproved}
                      </Tag>
                    </div>
                  </div>
                )
              })
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
