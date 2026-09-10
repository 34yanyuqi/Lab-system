import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Select, Table, Button, Modal, Input, message, Statistic, Tag
} from 'antd'
import {
  ArrowLeftOutlined, ClockCircleOutlined, CheckCircleOutlined,
  WarningOutlined, MinusCircleOutlined, StopOutlined, EditOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ReactECharts from 'echarts-for-react'
import { attendanceApi } from '@/api/attendance'
import { useRequestGuard } from '@/hooks/useRequestGuard'
import type { AttendanceRecord, AttendanceStudentSummary } from '@/types'
import { useAuth } from '@/contexts'

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const getStatusColor = (status: string) => {
  switch (status) {
    case '正常': return '#52c41a'
    case '迟到': return '#1677ff'
    case '早退': return '#ffc53d'
    case '缺卡': return '#faad14'
    case '旷工': return '#ff4d4f'
    default: return 'transparent'
  }
}

export default function TeacherAttendanceDetailPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const decodedName = decodeURIComponent(name || '')
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<AttendanceStudentSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null)
  const [editValues, setEditValues] = useState({ morning_on_time: '', morning_off_time: '', afternoon_on_time: '', afternoon_off_time: '' })
  const [saving, setSaving] = useState(false)

  const guard = useRequestGuard()

  const fetchData = useCallback(async () => {
    if (!decodedName) return
    const isLatest = guard()
    setLoading(true)
    try {
      const [detailRes, summaryRes] = await Promise.all([
        attendanceApi.getStudentDetail(decodedName, selectedMonth),
        attendanceApi.getStudentSummary(decodedName, selectedMonth)
      ])
      if (!isLatest()) return
      setRecords(detailRes.data.data.records)
      setSummary(summaryRes.data.data)
    } catch {
      if (!isLatest()) return
      message.error('获取考勤数据失败')
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [decodedName, selectedMonth, guard])

  useEffect(() => { fetchData() }, [fetchData])

  const monthOptions = useMemo(() => {
    const opts = []
    const y = now.getFullYear()
    for (let year = y - 1; year <= y; year++) {
      for (let m = 1; m <= 12; m++) {
        const val = `${year}-${String(m).padStart(2, '0')}`
        opts.push({ value: val, label: `${year}年${m}月` })
      }
    }
    return opts
  }, [])

  const calendarData = useMemo(() => {
    if (records.length === 0) return null
    const [year, month] = selectedMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
    const dayData: Record<string, string> = {}
    for (const r of records) {
      dayData[r.work_date] = r.day_status || ''
    }
    const weeks: { day: number; date: string; status: string }[][] = []
    let currentWeek: { day: number; date: string; status: string }[] = []
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ day: -1, date: '', status: '' })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`
      currentWeek.push({ day: d, date: dateStr, status: dayData[dateStr] || '' })
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: -1, date: '', status: '' })
      }
      weeks.push(currentWeek)
    }
    return { weeks, year, month }
  }, [records, selectedMonth])

  const columns: ColumnsType<AttendanceRecord> = [
    { title: '日期', dataIndex: 'work_date', key: 'work_date', width: 110 },
    {
      title: '上午上班', key: 'morning_on', width: 120,
      render: (_: unknown, r: AttendanceRecord) => (
        <span>
          {r.morning_on_time || '-'}
          {r.morning_on_time && (
            <Tag style={{ marginLeft: 4 }} color={r.morning_on_result === '正常' ? 'green' : r.morning_on_result === '迟到' ? 'blue' : 'gold'}>
              {r.morning_on_result}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '上午下班', key: 'morning_off', width: 120,
      render: (_: unknown, r: AttendanceRecord) => (
        <span>
          {r.morning_off_time || '-'}
          {r.morning_off_time && (
            <Tag style={{ marginLeft: 4 }} color={r.morning_off_result === '正常' ? 'green' : r.morning_off_result === '早退' ? 'orange' : 'gold'}>
              {r.morning_off_result}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '下午上班', key: 'afternoon_on', width: 120,
      render: (_: unknown, r: AttendanceRecord) => (
        <span>
          {r.afternoon_on_time || '-'}
          {r.afternoon_on_time && (
            <Tag style={{ marginLeft: 4 }} color={r.afternoon_on_result === '正常' ? 'green' : r.afternoon_on_result === '迟到' ? 'blue' : 'gold'}>
              {r.afternoon_on_result}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '下午下班', key: 'afternoon_off', width: 120,
      render: (_: unknown, r: AttendanceRecord) => (
        <span>
          {r.afternoon_off_time || '-'}
          {r.afternoon_off_time && (
            <Tag style={{ marginLeft: 4 }} color={r.afternoon_off_result === '正常' ? 'green' : r.afternoon_off_result === '早退' ? 'orange' : 'gold'}>
              {r.afternoon_off_result}
            </Tag>
          )}
        </span>
      )
    },
    {
      title: '当日状态', key: 'day_status', width: 90, align: 'center',
      render: (_: unknown, r: AttendanceRecord) => (
        <Tag color={r.day_status === '正常' ? 'green' : r.day_status === '迟到' ? 'blue' : r.day_status === '早退' ? 'orange' : r.day_status === '缺卡' ? 'gold' : 'red'}>
          {r.day_status}
        </Tag>
      )
    }
  ]

  if (user?.role === 'teacher') {
    columns.push({
      title: '操作', key: 'action', width: 80, align: 'center',
      render: (_: unknown, record: AttendanceRecord) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => {
            setEditRecord(record)
            setEditValues({
              morning_on_time: record.morning_on_time,
              morning_off_time: record.morning_off_time,
              afternoon_on_time: record.afternoon_on_time,
              afternoon_off_time: record.afternoon_off_time
            })
            setEditModalOpen(true)
          }}
        />
      )
    })
  }

  const handleSaveEdit = async () => {
    if (!editRecord) return
    setSaving(true)
    try {
      await attendanceApi.updateRecord(editRecord.id, editValues)
      message.success('修改成功')
      setEditModalOpen(false)
      fetchData()
    } catch (err: any) {
      message.error(err.response?.data?.message || '修改失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-shell">
      <Card className="compact-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/teacher/attendance')}>返回</Button>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{decodedName} 的考勤详情</span>
          <Select value={selectedMonth} onChange={setSelectedMonth} style={{ width: 140 }} options={monthOptions} />
        </div>
      </Card>

      {summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card><Statistic title="出勤天数" value={summary.totalDays} prefix={<ClockCircleOutlined />} /></Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="正常" value={summary.normalDays} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="迟到" value={summary.lateDays} prefix={<WarningOutlined />} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="早退" value={summary.earlyLeaveDays} prefix={<WarningOutlined />} valueStyle={{ color: '#ffc53d' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="缺卡" value={summary.missingPunchDays} prefix={<MinusCircleOutlined />} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="旷工" value={summary.absenteeismDays} prefix={<StopOutlined />} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic
                title="异常率"
                value={summary.anomalyRate}
                suffix="%"
                prefix={<WarningOutlined />}
                valueStyle={{ color: summary.anomalyRate <= 10 ? '#52c41a' : summary.anomalyRate <= 30 ? '#faad14' : '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {calendarData && (
        <Card title={`${calendarData.year}年${calendarData.month}月 考勤日历`} style={{ marginBottom: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="twl-table">
              <thead>
                <tr>
                  {weekDays.map((day, i) => (
                    <th key={i} style={{ padding: '8px', textAlign: 'center', fontWeight: 600, width: '14.28%' }}>
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarData.weeks.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((day, dayIndex) => (
                      <td
                        key={dayIndex}
                        style={{
                          padding: '4px',
                          textAlign: 'center',
                          minHeight: '50px',
                          verticalAlign: 'top',
                          backgroundColor: day.day === -1 ? 'var(--bg-soft)' : getStatusColor(day.status) + '20'
                        }}
                      >
                        {day.day !== -1 && (
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500 }}>{day.day}</div>
                            {day.status && (
                              <div style={{ marginTop: '2px', fontSize: '10px', color: getStatusColor(day.status) }}>
                                {day.status}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
            {[{ label: '正常', color: '#52c41a' }, { label: '迟到', color: '#1677ff' }, { label: '早退', color: '#ffc53d' }, { label: '缺卡', color: '#faad14' }, { label: '旷工', color: '#ff4d4f' }].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: item.color }} />
                <span style={{ fontSize: '12px' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="打卡明细">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={records}
          columns={columns}
          pagination={{ pageSize: 31 }}
          size="small"
          scroll={{ x: 700 }}
        />
      </Card>

      <Modal
        title="修改打卡时间"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={saving}
      >
        {editRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <div>
              <span style={{ display: 'inline-block', width: 100 }}>{editRecord.work_date}</span>
            </div>
            <Input
              addonBefore="上午上班"
              value={editValues.morning_on_time}
              onChange={e => setEditValues(v => ({ ...v, morning_on_time: e.target.value }))}
              placeholder="如 09:00"
            />
            <Input
              addonBefore="上午下班"
              value={editValues.morning_off_time}
              onChange={e => setEditValues(v => ({ ...v, morning_off_time: e.target.value }))}
              placeholder="如 11:30"
            />
            <Input
              addonBefore="下午上班"
              value={editValues.afternoon_on_time}
              onChange={e => setEditValues(v => ({ ...v, afternoon_on_time: e.target.value }))}
              placeholder="如 14:00"
            />
            <Input
              addonBefore="下午下班"
              value={editValues.afternoon_off_time}
              onChange={e => setEditValues(v => ({ ...v, afternoon_off_time: e.target.value }))}
              placeholder="如 17:30"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
