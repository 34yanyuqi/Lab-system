import { useState, useEffect, useMemo } from 'react'
import { Card, Select, Table, Progress, Button, message } from 'antd'
import ReactECharts from 'echarts-for-react'
import api from '@/api'
import type { StatisticsData, WeeklyStatsTask, WeeklyStatsSubmission } from '@/types'
import { calcPeriods } from '@/utils/format'

export default function TeacherStatisticsPage() {
  const [statistics, setStatistics] = useState<StatisticsData>({})
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyStatsTask[]>([])
  const [weeklySubmissions, setWeeklySubmissions] = useState<WeeklyStatsSubmission[]>([])
  const [weekFrom, setWeekFrom] = useState(1)
  const [weekTo, setWeekTo] = useState(1)
  const studentStats = statistics.studentStats || []

  useEffect(() => {
    api.get('/users/statistics')
      .then(response => setStatistics(response.data))
      .catch(() => message.error('加载统计数据失败'))

    api.get('/users/weekly-stats')
      .then(response => {
        setWeeklyTasks(response.data.tasks || [])
        setWeeklySubmissions(response.data.submissions || [])
      })
      .catch(() => message.error('加载周次统计失败'))
  }, [])

  const calcWeeks = (task: WeeklyStatsTask) => calcPeriods(task)

  const completionBarOption = useMemo(() => {
    if (weeklyTasks.length === 0) {
      return { title: { text: '暂无任务数据', left: 'center', top: 'center', textStyle: { color: '#999', fontSize: 14 } } }
    }

    const from = Math.min(weekFrom, weekTo)
    const to = Math.max(weekFrom, weekTo)

    const taskNames: string[] = []
    const percentages: number[] = []
    const detailTexts: string[] = []

    weeklyTasks.forEach(task => {
      const periods = calcWeeks(task)
      const studentIds = (() => { try { return JSON.parse(String(task.student_ids || '[]')) } catch { return [] } })()
      const targetPeriods = periods.filter(p => p.index >= from && p.index <= to)
      const weekCount = targetPeriods.length
      const denominator = studentIds.length * weekCount

      let submittedCount = 0
      if (targetPeriods.length > 0) {
        const taskSubs = weeklySubmissions.filter(s => Number(s.task_id) === task.id)
        targetPeriods.forEach(tp => {
          const weekSubs = taskSubs.filter(s => {
            const st = new Date(String(s.submit_time).replace(' ', 'T'))
            return st >= tp.startDate && st <= tp.endDate
          })
          const uniqueStudents = new Set(weekSubs.map(s => s.student_id))
          submittedCount += uniqueStudents.size
        })
      }

      const percent = denominator > 0 ? Math.round((submittedCount / denominator) * 100) : 0
      taskNames.push(task.title)
      percentages.push(percent)
      detailTexts.push(submittedCount + '/' + denominator)
    })

    return {
      tooltip: {
        trigger: 'axis',
        formatter(params: any) {
          const p = Array.isArray(params) ? params[0] : params
          return p.name + '<br/>完成率: ' + p.value + '%<br/>提交: ' + detailTexts[p.dataIndex]
        }
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: 40, containLabel: true },
      xAxis: {
        type: 'category',
        data: taskNames,
        axisLabel: { rotate: 0, fontSize: 12, interval: 0, width: 40, overflow: 'break', lineHeight: 14 }
      },
      yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      series: [{
        name: '完成率',
        type: 'bar',
        data: percentages,
        barMaxWidth: 50,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color(params: any) {
            const v = params.value
            if (v >= 80) return '#52c41a'
            if (v >= 60) return '#2563eb'
            if (v >= 30) return '#faad14'
            return '#ff4d4f'
          }
        },
        label: { show: true, position: 'top', formatter: '{c}%', fontSize: 12 }
      }]
    }
  }, [weeklyTasks, weeklySubmissions, weekFrom, weekTo])

  // 周次选项按实际任务周期动态生成，避免超过 20 周的长期任务无法选择
  const weekSelectOptions = useMemo(() => {
    const maxWeeks = weeklyTasks.reduce((max, task) => Math.max(max, calcWeeks(task).length), 0)
    const optionCount = Math.max(maxWeeks, 20)
    return Array.from({ length: optionCount }, (_, i) => ({
      value: i + 1,
      label: (i + 1) + '周'
    }))
  }, [weeklyTasks])

  return (
    <div className="page-shell">
      <Card
        className="compact-card"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>任务完成率统计</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>周次范围：</span>
            <span style={{ fontSize: 13 }}>第</span>
            <Select value={weekFrom} onChange={v => setWeekFrom(v)} style={{ width: 90 }} size="small" options={weekSelectOptions} />
            <span style={{ fontSize: 13 }}>至第</span>
            <Select value={weekTo} onChange={v => setWeekTo(v)} style={{ width: 90 }} size="small" options={weekSelectOptions} />
            <span style={{ fontSize: 13 }}>周</span>
          </div>
        }
      >
        <ReactECharts option={completionBarOption} style={{ height: 360 }} />
      </Card>

      <Card className="compact-card section-gap">
        <div className="card-head card-head-between">
          <div><h3>学生统计详情</h3></div>
          <Button type="primary" onClick={() => message.info('导出功能开发中...')}>导出数据</Button>
        </div>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={studentStats}
          columns={[
            { title: '学号', dataIndex: 'student_id', key: 'student_id', width: 120 },
            { title: '专业', dataIndex: 'student_major', key: 'student_major', width: 160 },
            { title: '提交次数', dataIndex: 'total_submissions', key: 'total_submissions', width: 100 },
            { title: '通过次数', dataIndex: 'approved_count', key: 'approved_count', width: 100 },
            {
              title: '通过率', key: 'pass_rate', width: 180,
              render: (_: any, row: any) => {
                const percent = row.total_submissions ? Math.round((row.approved_count / row.total_submissions) * 100) : 0
                return <Progress percent={percent} size="small" strokeColor={percent >= 80 ? '#2563eb' : percent >= 60 ? '#60a5fa' : '#cbd5e1'} />
              }
            }
          ]}
        />
      </Card>
    </div>
  )
}
