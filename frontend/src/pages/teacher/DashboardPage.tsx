import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Table, Empty, message } from 'antd'
import { FileTextOutlined, CheckCircleOutlined, UploadOutlined, ClockCircleOutlined, TeamOutlined, BarChartOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '@/api'
import type { StatisticsData, StudentOverviewData } from '@/types'

export default function TeacherDashboardPage() {
  const navigate = useNavigate()
  const [statistics, setStatistics] = useState<StatisticsData>({})
  const [studentOverview, setStudentOverview] = useState<StudentOverviewData | null>(null)

  useEffect(() => {
    api.get('/users/statistics')
      .then(response => setStatistics(response.data))
      .catch(() => message.error('加载统计数据失败'))
    api.get('/users/student-overview')
      .then(response => setStudentOverview(response.data))
      .catch(() => message.error('加载学生概览失败'))
  }, [])

  const stats = [
    { title: '总任务数', value: statistics.totalTasks || 0, icon: <FileTextOutlined />, color: 'blue' },
    { title: '进行中', value: statistics.activeTasks || 0, icon: <CheckCircleOutlined />, color: 'green' },
    { title: '总提交数', value: statistics.totalSubmissions || 0, icon: <UploadOutlined />, color: 'orange' },
    { title: '待审核', value: statistics.pendingSubmissions || 0, icon: <ClockCircleOutlined />, color: 'red' }
  ]

  const gradeColumns: ColumnsType<{ student_grade: string; count: number }> = [
    { title: '年级', dataIndex: 'student_grade', key: 'student_grade', render: (v: string) => v || '未填写' },
    { title: '人数', dataIndex: 'count', key: 'count', align: 'center' }
  ]

  const majorColumns: ColumnsType<{ student_major: string; count: number }> = [
    { title: '专业', dataIndex: 'student_major', key: 'student_major', render: (v: string) => v || '未填写' },
    { title: '人数', dataIndex: 'count', key: 'count', align: 'center' }
  ]

  return (
    <div className="page-shell">
      <Row gutter={[16, 16]}>
        {stats.map(item => (
          <Col span={6} xs={24} sm={12} lg={6} key={item.title}>
            <Card className="stat-card">
              <div className="stat-content">
                <div className={`stat-icon ${item.color}`}>{item.icon}</div>
                <div className="stat-info">
                  <div className="stat-value">{item.value}</div>
                  <div className="stat-label">{item.title}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="section-gap">
        <Col span={24}>
          <Card title={<span><TeamOutlined style={{ marginRight: 8 }} />学生基本统计</span>}>
            {studentOverview ? (
              <>
                <div style={{ marginBottom: 16, fontSize: 15, color: 'var(--text-primary)', fontWeight: 600 }}>
                  学生总数：{studentOverview.totalStudents} 人
                </div>
                <Row gutter={[16, 16]}>
                  <Col span={12} xs={24} lg={12}>
                    <Table
                      columns={gradeColumns}
                      dataSource={studentOverview.gradeStats}
                      rowKey="student_grade"
                      pagination={false}
                      size="small"
                      title={() => <span style={{ fontWeight: 600 }}>按年级统计</span>}
                    />
                  </Col>
                  <Col span={12} xs={24} lg={12}>
                    <Table
                      columns={majorColumns}
                      dataSource={studentOverview.majorStats}
                      rowKey="student_major"
                      pagination={false}
                      size="small"
                      title={() => <span style={{ fontWeight: 600 }}>按专业统计</span>}
                    />
                  </Col>
                </Row>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>加载中...</div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="section-gap">
        <Col span={12} xs={24} lg={12}>
          <Card title="快捷操作">
            <div className="action-grid">
              <button type="button" className="action-tile" onClick={() => navigate('/teacher/tasks')}>
                <span className="action-icon"><PlusOutlined /></span>
                <span className="action-text">
                  <strong>发布新任务</strong>
                  <small>创建任务并分配学生</small>
                </span>
              </button>
              <button type="button" className="action-tile" onClick={() => navigate('/teacher/check')}>
                <span className="action-icon"><CheckCircleOutlined /></span>
                <span className="action-text">
                  <strong>查看提交</strong>
                  <small>审核学生提交与反馈</small>
                </span>
              </button>
              <button type="button" className="action-tile" onClick={() => navigate('/teacher/statistics')}>
                <span className="action-icon"><BarChartOutlined /></span>
                <span className="action-text">
                  <strong>统计分析</strong>
                  <small>查看任务与进度数据</small>
                </span>
              </button>
            </div>
          </Card>
        </Col>
        <Col span={12} xs={24} lg={12}>
          <Card title="最新通知">
            <Empty description="暂无通知" />
          </Card>
        </Col>
      </Row>
    </div>
  )
}