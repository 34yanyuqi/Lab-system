export function formatDate(value?: string): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateTime(value?: string): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

export function getDeadlineTime(endDate: string): number {
  const d = new Date(endDate + 'T23:59:59')
  return d.getTime()
}

export function getRemainingDays(endDate: string): number {
  const deadline = getDeadlineTime(endDate)
  if (Number.isNaN(deadline)) return 0
  const diff = deadline - Date.now()
  // 使用 floor：还剩 0 天表示"今天截止"，避免把今天截止误判为"剩余1天"
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function getRemainingDaysLabel(endDate: string): string {
  const days = getRemainingDays(endDate)
  if (days < 0) return '已截止'
  if (days === 0) return '今天截止'
  return `剩余${days}天`
}

export function getRemainingDaysClass(endDate: string): string {
  const days = getRemainingDays(endDate)
  if (days < 0) return 'deadline-passed'
  if (days <= 3) return 'deadline-near'
  return 'deadline-safe'
}

// 富文本渲染统一由 utils/richText 提供（含 XSS 白名单清洗），此处仅做转出以保持向后兼容
export { hasHtmlMarkup, formatRichTextForDisplay } from './richText'

export interface Period {
  index: number
  startDate: Date
  endDate: Date
}

export function calcPeriods(task: { create_time?: string; end_date: string; check_frequency?: number }): Period[] {
  const rawCreate = String(task.create_time || '').replace(' ', 'T')
  const taskStart = new Date(rawCreate.includes('T') ? rawCreate : rawCreate + 'T00:00:00')
  taskStart.setHours(0, 0, 0, 0)
  const end = new Date(task.end_date + 'T23:59:59')
  const periods: Period[] = []

  if (end < taskStart) return periods

  // 计算任务创建日期所在周的周一
  const dow = taskStart.getDay() // 0=周日, 1=周一, ...
  const firstMonday = new Date(taskStart)
  firstMonday.setDate(firstMonday.getDate() - (dow === 0 ? 6 : dow - 1))
  firstMonday.setHours(0, 0, 0, 0)

  let idx = 1
  let weekStart = new Date(firstMonday)

  while (weekStart <= end) {
    // 周日 23:59:59 为本周结束
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    // 第一期开始时间不早于任务下达日期
    const periodStart = idx === 1 && taskStart > weekStart ? new Date(taskStart) : new Date(weekStart)
    const periodEnd = weekEnd > end ? new Date(end) : weekEnd

    periods.push({
      index: idx,
      startDate: periodStart,
      endDate: periodEnd
    })

    // 下一周一
    weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() + 1)
    weekStart.setHours(0, 0, 0, 0)
    idx++
  }

  return periods
}
