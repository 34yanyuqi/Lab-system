import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Card, Row, Col, Select, Table, Statistic, Tag
} from 'antd'
import {
  ClockCircleOutlined, CheckCircleOutlined, WarningOutlined,
  MinusCircleOutlined, StopOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import ReactECharts from 'echarts-for-react'
import { attendanceApi } from '@/api/attendance'
import { useRequestGuard } from '@/hooks/useRequestGuard'
import { useAuth } from '@/contexts'
import type { AttendanceRecord, AttendanceStudentSummary } from '@/types'

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

export default function StudentAttendancePage() {
  const { user } = useAuth()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [startYear, setStartYear] = useState(currentYear)
  const [startMonthNum, setStartMonthNum] = useState(currentMonth)
  const [endYear, setEndYear] = useState(currentYear)
  const [endMonthNum, setEndMonthNum] = useState(currentMonth)

  const startMonth = `${startYear}-${String(startMonthNum).padStart(2, '0')}`
  const endMonth = `${endYear}-${String(endMonthNum).padStart(2, '0')}`

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [summary, setSummary] = useState<AttendanceStudentSummary | null>(null)
  const [overview, setOverview] = useState<AttendanceStudentSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const calendarRef = useRef<HTMLDivElement>(null)
  const guard = useRequestGuard()

  useEffect(() => {
    if (!user?.username) return
    const isLatest = guard()
    let scrollTimer: ReturnType<typeof setTimeout> | undefined

    const fetchData = async () => {
      setLoading(true)
      try {
        const [detailRes, summaryRes, overviewRes] = await Promise.all([
          attendanceApi.getRecords(endMonth, user.username),
          attendanceApi.getStudentSummary(user.username, endMonth),
          attendanceApi.getStudentOverviewRange(user.username, startMonth, endMonth)
        ])
        if (!isLatest()) return
        setRecords(detailRes.data.data.records || [])
        setSummary(summaryRes.data.data || null)
        setOverview(overviewRes.data.data || null)

        scrollTimer = setTimeout(() => {
          if (calendarRef.current) {
            calendarRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 100)
      } catch {
        // ignore
      } finally {
        if (isLatest()) setLoading(false)
      }
    }
    fetchData()

    return () => {
      if (scrollTimer) clearTimeout(scrollTimer)
    }
  }, [user?.username, startMonth, endMonth, guard])

  const yearOptions = useMemo(() => {
    const opts = []
    for (let year = currentYear - 5; year <= currentYear; year++) {
      opts.push({ value: year, label: `${year}年` })
    }
    return opts
  }, [])

  const monthNumOptions = useMemo(() => {
    const opts = []
    for (let m = 1; m <= 12; m++) {
      opts.push({ value: m, label: `${m}月` })
    }
    return opts
  }, [])

  const calendarData = useMemo(() => {
    if (!records || records.length === 0) return null
    const [year, month] = endMonth.split('-').map(Number)
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
      const dateStr = `${endMonth}-${String(d).padStart(2, '0')}`
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
  }, [records, endMonth])

  const pieOption = useMemo(() => {
    if (!overview) return {}
    const data = [
      { value: overview.normalDays, name: '正常' },
      { value: overview.lateDays, name: '迟到' },
      { value: overview.earlyLeaveDays, name: '早退' },
      { value: overview.missingPunchDays, name: '缺卡' },
      { value: overview.absenteeismDays, name: '旷工' }
    ].filter(d => d.value > 0)
    if (data.length === 0) return {}
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        data,
        color: ['#52c41a', '#1677ff', '#ffc53d', '#faad14', '#ff4d4f']
      }]
    }
  }, [overview])

  const barOption = useMemo(() => {
    if (!overview) return {}
    
    const totalDays = overview.totalDays || 0
    const absentRate = totalDays > 0 ? Math.round(((overview.missingPunchDays || 0) / (totalDays * 2)) * 100) : 0
    const lateRate = totalDays > 0 ? Math.round(((overview.lateDays || 0) / (totalDays * 2)) * 100) : 0

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
        data: ['我的考勤'],
        axisLabel: {
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
          data: [absentRate],
          itemStyle: { color: '#ff4d4f' },
          barWidth: '50%',
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%'
          }
        },
        {
          name: '迟到率',
          type: 'bar',
          data: [lateRate],
          itemStyle: { color: '#1677ff' },
          barWidth: '50%',
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%'
          }
        }
      ]
    }
  }, [overview])

  const columns: ColumnsType<AttendanceRecord> = [
    { title: '日期', dataIndex: 'work_date', key: 'work_date', width: 110 },
    {
      title: '上午上班', key: 'morning_on', width: 130,
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
      title: '上午下班', key: 'morning_off', width: 130,
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
      title: '下午上班', key: 'afternoon_on', width: 130,
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
      title: '下午下班', key: 'afternoon_off', width: 130,
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
      title: '状态', dataIndex: 'day_status', key: 'day_status', width: 80, align: 'center',
      render: (v: string) => <Tag color={v === '正常' ? 'green' : v === '迟到' ? 'blue' : v === '早退' ? 'orange' : v === '缺卡' ? 'gold' : 'red'}>{v}</Tag>
    }
  ]

  return (
    <div className="page-shell">
      <Card className="compact-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 600 }}>我的考勤</span>
          <span>开始时间：</span>
          <Select value={startYear} onChange={setStartYear} style={{ width: 90 }} options={yearOptions} placeholder="年份" />
          <Select value={startMonthNum} onChange={setStartMonthNum} style={{ width: 70 }} options={monthNumOptions} placeholder="月份" />
          <span>~</span>
          <span>结束时间：</span>
          <Select value={endYear} onChange={setEndYear} style={{ width: 90 }} options={yearOptions} placeholder="年份" />
          <Select value={endMonthNum} onChange={setEndMonthNum} style={{ width: 70 }} options={monthNumOptions} placeholder="月份" />
        </div>
      </Card>

      {overview && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card><Statistic title="出勤天数" value={overview.totalDays} prefix={<ClockCircleOutlined />} /></Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="正常" value={overview.normalDays} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="迟到" value={overview.lateDays} prefix={<WarningOutlined />} valueStyle={{ color: '#1677ff' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="早退" value={overview.earlyLeaveDays} prefix={<WarningOutlined />} valueStyle={{ color: '#ffc53d' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="缺卡" value={overview.missingPunchDays} prefix={<MinusCircleOutlined />} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic title="旷工" value={overview.absenteeismDays} prefix={<StopOutlined />} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={3} xs={12} sm={8} lg={3}>
            <Card>
              <Statistic
                title="异常率"
                value={overview.anomalyRate}
                suffix="%"
                prefix={<WarningOutlined />}
                valueStyle={{ color: overview.anomalyRate <= 10 ? '#52c41a' : overview.anomalyRate <= 30 ? '#faad14' : '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {calendarData && (
        <Card title={`${calendarData.year}年${calendarData.month}月 考勤日历`} style={{ marginBottom: 16 }}>
          <div ref={calendarRef} style={{ overflowX: 'auto' }}>
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

      {Object.keys(pieOption).length > 0 && (
        <Card title="出勤分布" style={{ marginBottom: 16 }}>
          <ReactECharts option={pieOption} style={{ height: 260 }} />
        </Card>
      )}

      {Object.keys(barOption).length > 0 && (
        <Card title="缺勤/迟到统计" style={{ marginBottom: 16 }}>
          <ReactECharts option={barOption} style={{ height: 260 }} />
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
    </div>
  )
}