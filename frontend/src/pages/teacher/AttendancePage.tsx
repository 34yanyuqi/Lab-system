import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Table, Button, Select, Modal, Upload, message, Statistic, Tag, Popconfirm
} from 'antd'
import {
  UploadOutlined, ClockCircleOutlined, TeamOutlined,
  WarningOutlined, MinusCircleOutlined, StopOutlined, EyeOutlined, SafetyOutlined, DeleteOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ReactECharts from 'echarts-for-react'
import { attendanceApi } from '@/api/attendance'
import type { AttendanceOverview, AttendanceStudentSummary } from '@/types'
import GradeSelector from '@/components/common/GradeSelector'
import { useRequestGuard } from '@/hooks/useRequestGuard'

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

interface AnomalyRecord {
  date: string
  name: string
  punchType: string
  anomalyType: string
  color: string
  grade?: string
}

interface CalendarDay {
  day: number
  date: string
  anomalies: AnomalyRecord[]
}

export default function TeacherAttendancePage() {
  const navigate = useNavigate()
  
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1
  
  const [startYear, setStartYear] = useState(currentYear)
  const [startMonthNum, setStartMonthNum] = useState(currentMonth)
  const [endYear, setEndYear] = useState(currentYear)
  const [endMonthNum, setEndMonthNum] = useState(currentMonth)
  
  const startMonth = `${startYear}-${String(startMonthNum).padStart(2, '0')}`
  const endMonth = `${endYear}-${String(endMonthNum).padStart(2, '0')}`
  const [overview, setOverview] = useState<AttendanceOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [anomalyRecords, setAnomalyRecords] = useState<AnomalyRecord[]>([])
  const [grades, setGrades] = useState<string[]>([])
  const [calendarGrade, setCalendarGrade] = useState<string | undefined>()
  const [barGrade, setBarGrade] = useState<string | undefined>()

  const gradesGuard = useRequestGuard()
  const overviewGuard = useRequestGuard()
  const anomalyGuard = useRequestGuard()

  const fetchGrades = useCallback(async () => {
    const isLatest = gradesGuard()
    try {
      const res = await attendanceApi.getAnomalyRecords(endMonth)
      if (!isLatest()) return
      setGrades(res.data.data.grades || [])
    } catch {
      if (!isLatest()) return
      setGrades([])
    }
  }, [endMonth, gradesGuard])

  const fetchOverview = useCallback(async () => {
    const isLatest = overviewGuard()
    try {
      const res = await attendanceApi.getOverviewRange(startMonth, endMonth, barGrade)
      if (!isLatest()) return
      setOverview(res.data.data)
    } catch {
      if (!isLatest()) return
      message.error('获取考勤概览失败')
    }
  }, [startMonth, endMonth, barGrade, overviewGuard])

  const fetchAnomalyRecords = useCallback(async () => {
    const isLatest = anomalyGuard()
    try {
      const res = await attendanceApi.getAnomalyRecords(endMonth, calendarGrade)
      if (!isLatest()) return
      setAnomalyRecords(res.data.data.anomalyRecords || [])
    } catch {
      if (!isLatest()) return
      message.error('获取异常记录失败')
    }
  }, [endMonth, calendarGrade, anomalyGuard])

  useEffect(() => {
    fetchGrades()
  }, [fetchGrades])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchOverview(), fetchAnomalyRecords()]).finally(() => {
      setLoading(false)
    })
  }, [fetchOverview, fetchAnomalyRecords])

  const calendarData = useMemo(() => {
    if (anomalyRecords.length === 0) return null
    
    const [year, month] = endMonth.split('-').map(Number)
    const daysInMonth = new Date(year, month, 0).getDate()
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

    const dayAnomalies: Record<string, AnomalyRecord[]> = {}
    for (const record of anomalyRecords) {
      if (!dayAnomalies[record.date]) {
        dayAnomalies[record.date] = []
      }
      dayAnomalies[record.date].push(record)
    }

    const weeks: CalendarDay[][] = []
    let currentWeek: CalendarDay[] = []

    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push({ day: -1, date: '', anomalies: [] })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${endMonth}-${String(day).padStart(2, '0')}`
      currentWeek.push({
        day,
        date: dateStr,
        anomalies: dayAnomalies[dateStr] || []
      })
      
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: -1, date: '', anomalies: [] })
      }
      weeks.push(currentWeek)
    }

    return { weeks, year, month }
  }, [anomalyRecords, endMonth])

  const yearOptions = useMemo(() => {
    const options = []
    const currentYear = currentDate.getFullYear()
    for (let year = currentYear - 5; year <= currentYear; year++) {
      options.push({ value: year, label: `${year}年` })
    }
    return options
  }, [])

  const monthNumOptions = useMemo(() => {
    const options = []
    for (let month = 1; month <= 12; month++) {
      options.push({ value: month, label: `${month}月` })
    }
    return options
  }, [])

  const totalStats = useMemo(() => {
    if (!overview || !overview.students) return null

    const { students } = overview
    if (!Array.isArray(students)) return null
    
    let totalLate = 0, totalEarly = 0, totalMissing = 0, totalAbsent = 0, totalAnomalyPunches = 0, totalPunches = 0

    for (const student of students) {
      totalLate += student.lateDays || 0
      totalEarly += student.earlyLeaveDays || 0
      totalMissing += student.missingPunchDays || 0
      totalAbsent += student.absenteeismDays || 0
      totalAnomalyPunches += student.anomalyPunches || 0
      totalPunches += student.totalPunches || 0
    }

    return {
      studentCount: students.length,
      anomalyRate: totalPunches > 0 ? Math.round((totalAnomalyPunches / totalPunches) * 100) : 0,
      totalLate,
      totalEarly,
      totalMissing,
      totalAbsent
    }
  }, [overview])



  const barOption = useMemo(() => {
    if (!overview || !overview.students || overview.students.length === 0) return {}

    const names = overview.students.map(s => s.name || '')
    const absentRateData = overview.students.map(s => {
      const totalDays = s.totalDays || 0
      const missingPunches = s.missingPunchDays || 0
      const denominator = totalDays * 2
      return denominator > 0 ? Math.round((missingPunches / denominator) * 100) : 0
    })
    const lateRateData = overview.students.map(s => {
      const totalDays = s.totalDays || 0
      const lateDays = s.lateDays || 0
      const denominator = totalDays * 2
      return denominator > 0 ? Math.round((lateDays / denominator) * 100) : 0
    })

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          let result = `<strong>${params[0].axisValue}</strong><br/>`
          params.forEach((item: any) => {
            result += `${item.marker} ${item.seriesName}: ${item.value}%<br/>`
          })
          return result
        }
      },
      legend: {
        data: ['缺勤率', '迟到率'],
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: names,
        axisLabel: {
          interval: 0,
          rotate: 45,
          fontSize: 12
        }
      },
      yAxis: {
        type: 'value',
        name: '率 (%)',
        max: 100,
        axisLabel: {
          formatter: '{value}%'
        }
      },
      series: [
        {
          name: '缺勤率',
          type: 'bar',
          data: absentRateData,
          itemStyle: { color: '#ff4d4f' },
          barWidth: '30%',
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%'
          }
        },
        {
          name: '迟到率',
          type: 'bar',
          data: lateRateData,
          itemStyle: { color: '#1677ff' },
          barWidth: '30%',
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%'
          }
        }
      ]
    }
  }, [overview])

  const columns: ColumnsType<AttendanceStudentSummary> = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <a onClick={() => navigate(`/teacher/attendance/student/${encodeURIComponent(name)}`)}>
          {name}
        </a>
      )
    },
    { title: '出勤天数', dataIndex: 'totalDays', key: 'totalDays', align: 'center' },
    {
      title: '正常',
      dataIndex: 'normalDays',
      key: 'normalDays',
      align: 'center',
      render: (value: number) => <Tag color="green">{value}</Tag>
    },
    {
      title: '迟到',
      dataIndex: 'lateDays',
      key: 'lateDays',
      align: 'center',
      render: (value: number) => value > 0 ? <Tag color="blue">{value}</Tag> : '-'
    },
    {
      title: '早退',
      dataIndex: 'earlyLeaveDays',
      key: 'earlyLeaveDays',
      align: 'center',
      render: (value: number) => value > 0 ? <Tag color="orange">{value}</Tag> : '-'
    },
    {
      title: '缺卡',
      dataIndex: 'missingPunchDays',
      key: 'missingPunchDays',
      align: 'center',
      render: (value: number) => value > 0 ? <Tag color="gold">{value}</Tag> : '-'
    },
    {
      title: '旷工',
      dataIndex: 'absenteeismDays',
      key: 'absenteeismDays',
      align: 'center',
      render: (value: number) => value > 0 ? <Tag color="red">{value}</Tag> : '-'
    },
    {
      title: '异常率',
      dataIndex: 'anomalyRate',
      key: 'anomalyRate',
      align: 'center',
      render: (value: number) => {
        const color = value <= 10 ? '#52c41a' : value <= 30 ? '#faad14' : '#ff4d4f'
        return <span style={{ color, fontWeight: 600 }}>{value}%</span>
      }
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      render: (_: unknown, record: AttendanceStudentSummary) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/teacher/attendance/student/${encodeURIComponent(record.name)}`)}
        >
          详情
        </Button>
      )
    }
  ]

  const handleImport = async () => {
    if (!importFile) return

    setImporting(true)
    try {
      const res = await attendanceApi.uploadExcel(importFile)
      const { imported, skipped } = res.data.data
      
      setImportResult({ imported, skipped })
      message.success(`导入成功：${imported} 条记录`)
      setImportFile(null)
      
      await Promise.all([fetchOverview(), fetchAnomalyRecords(), fetchGrades()])
    } catch (err: any) {
      message.error(err.response?.data?.message || err.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await attendanceApi.deleteRecords(endMonth)
      message.success(res.data.message)
      
      await Promise.all([fetchOverview(), fetchAnomalyRecords(), fetchGrades()])
    } catch (err: any) {
      message.error(err.response?.data?.message || err.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const renderCalendarCell = (day: CalendarDay) => {
    if (day.day === -1) return null

    return (
      <div className="calendar-day-content">
        <div className="calendar-day-number">{day.day}</div>
        {day.anomalies.length > 0 ? (
          <div className="calendar-anomaly-list">
            {day.anomalies.map((anomaly, idx) => (
              <div key={idx} className="calendar-anomaly-item" style={{ color: anomaly.color }}>
                {anomaly.name} {anomaly.punchType !== '旷工' ? anomaly.punchType : ''}
              </div>
            ))}
          </div>
        ) : (
          <div className="calendar-day-normal">正常</div>
        )}
      </div>
    )
  }

  return (
    <div className="page-shell">
      <Card className="compact-card" style={{ marginBottom: 16 }}>
        <div className="card-head-between">
          <span style={{ fontWeight: 600 }}>考勤管理</span>
          <div className="header-actions">
            <span style={{ marginRight: 8 }}>开始时间：</span>
            <Select
              value={startYear}
              onChange={setStartYear}
              style={{ width: 90, marginRight: 4 }}
              options={yearOptions}
              placeholder="年份"
            />
            <Select
              value={startMonthNum}
              onChange={setStartMonthNum}
              style={{ width: 70, marginRight: 12 }}
              options={monthNumOptions}
              placeholder="月份"
            />
            <span style={{ marginRight: 8 }}>~</span>
            <span style={{ marginRight: 8 }}>结束时间：</span>
            <Select
              value={endYear}
              onChange={setEndYear}
              style={{ width: 90, marginRight: 4 }}
              options={yearOptions}
              placeholder="年份"
            />
            <Select
              value={endMonthNum}
              onChange={setEndMonthNum}
              style={{ width: 70, marginRight: 12 }}
              options={monthNumOptions}
              placeholder="月份"
            />
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => { setImportModalOpen(true); setImportResult(null); }}
              style={{ marginRight: 12 }}
            >
              上传Excel
            </Button>
            <Button
              icon={<SafetyOutlined />}
              onClick={() => navigate('/teacher/attendance/permissions')}
              style={{ marginRight: 12 }}
            >
              权限管理
            </Button>
            <Popconfirm
              title={`确定删除 ${endMonth} 的所有考勤数据吗？此操作不可恢复！`}
              onConfirm={handleDelete}
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button icon={<DeleteOutlined />} danger loading={deleting}>
                清空结束月
              </Button>
            </Popconfirm>
          </div>
        </div>
      </Card>

      {totalStats && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic title="总人数" value={totalStats.studentCount} prefix={<TeamOutlined />} />
            </Card>
          </Col>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic
                title="异常率"
                value={totalStats.anomalyRate}
                suffix="%"
                prefix={<WarningOutlined />}
                valueStyle={{
                  color: totalStats.anomalyRate <= 10 ? '#52c41a' : totalStats.anomalyRate <= 30 ? '#faad14' : '#ff4d4f'
                }}
              />
            </Card>
          </Col>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic title="迟到人次" value={totalStats.totalLate} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic title="缺卡人次" value={totalStats.totalMissing} prefix={<MinusCircleOutlined />} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic title="早退人次" value={totalStats.totalEarly} prefix={<WarningOutlined />} valueStyle={{ color: '#ffc53d' }} />
            </Card>
          </Col>
          <Col span={4} xs={12} sm={8} lg={4}>
            <Card className="stat-card">
              <Statistic title="旷工人次" value={totalStats.totalAbsent} prefix={<StopOutlined />} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
        </Row>
      )}

      {overview && overview.students && overview.students.length > 0 && (
        <Card
          title="学生缺勤/迟到统计"
          style={{ marginBottom: 16 }}
          extra={
            <GradeSelector
              value={barGrade}
              onChange={setBarGrade}
              grades={grades}
            />
          }
        >
          <ReactECharts option={barOption} style={{ height: 350 }} />
        </Card>
      )}

      {calendarData && (
        <Card
          title={`${calendarData.year}年${calendarData.month}月 异常打卡日历`}
          style={{ marginBottom: 16 }}
          extra={
            <GradeSelector
              value={calendarGrade}
              onChange={setCalendarGrade}
              grades={grades}
            />
          }
        >
          <div className="calendar-container">
            <table className="calendar-table">
              <thead>
                <tr>
                  {weekDays.map((day, index) => (
                    <th key={index} className="calendar-header-cell">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarData.weeks.map((week, weekIndex) => (
                  <tr key={weekIndex}>
                    {week.map((day, dayIndex) => (
                      <td key={dayIndex} className={`calendar-cell ${day.day === -1 ? 'calendar-empty-cell' : ''}`}>
                        {renderCalendarCell(day)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="calendar-legend">
            <div className="legend-item">
              <span className="legend-color" style={{ color: '#1677ff' }}>蓝色</span>
              <span className="legend-text">= 迟到/早退</span>
            </div>
            <div className="legend-item">
              <span className="legend-color" style={{ color: '#ff4d4f' }}>红色</span>
              <span className="legend-text">= 缺卡/旷工</span>
            </div>
          </div>
        </Card>
      )}

      <Card title="学生考勤汇总">
        <Table
          rowKey="name"
          loading={loading}
          dataSource={overview?.students || []}
          columns={columns}
          pagination={{ pageSize: 15 }}
          size="small"
        />
      </Card>

      <Modal
        title="上传考勤Excel"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalOpen(false)}>取消</Button>,
          <Button
            key="import"
            type="primary"
            loading={importing}
            disabled={!importFile}
            onClick={handleImport}
          >
            确认导入
          </Button>
        ]}
      >
        <Upload
          beforeUpload={(file) => { setImportFile(file); return false }}
          maxCount={1}
          onRemove={() => setImportFile(null)}
          accept=".xlsx,.xls"
        >
          <Button icon={<UploadOutlined />}>选择Excel文件</Button>
        </Upload>
        {importResult && (
          <div style={{ marginTop: 16 }}>
            <p>导入成功：{importResult.imported} 条</p>
            {importResult.skipped > 0 && (
              <p style={{ color: '#faad14' }}>
                跳过：{importResult.skipped} 条（未加入考勤组/休息/重复）
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}