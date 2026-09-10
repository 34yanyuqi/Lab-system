export const gradeOptions = Array.from({ length: 18 }, (_, i) => ({
  value: String(2023 + i),
  label: String(2023 + i)
}))

export const typeLabels: Record<string, string> = {
  development: '开发任务',
  research: '研究任务',
  paper: '论文写作',
  experiment: '实验任务',
  other: '其他任务'
}

export const reviewStatusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回'
}

export function getTypeLabel(type: string): string {
  return typeLabels[type] || type
}

export function getTagColor(type: string): string {
  const colors: Record<string, string> = {
    development: 'blue',
    research: 'purple',
    paper: 'green',
    experiment: 'orange',
    other: 'default'
  }
  return colors[type] || 'default'
}

export function getReviewTagColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'orange',
    approved: 'green',
    rejected: 'red'
  }
  return colors[status] || 'default'
}

export const categoryOptions = [
  { value: '家具', label: '家具' },
  { value: '软件', label: '软件' },
  { value: '设备', label: '设备' },
  { value: '低值设备', label: '低值设备' }
]

export const equipmentAllColumns: Array<{ key: string; label: string }> = [
  { key: 'category', label: '类别' },
  { key: 'school_code', label: '校内编号' },
  { key: 'serial_number', label: '设备序列号' },
  { key: 'name', label: '设备名称' },
  { key: 'value', label: '价值' },
  { key: 'model', label: '型号' },
  { key: 'teacher_name', label: '领用导师' },
  { key: 'student_school_id', label: '使用学生学号' },
  { key: 'student_name', label: '使用学生姓名' },
  { key: 'status', label: '领用状态' },
  { key: 'location', label: '存放地址' },
  { key: 'purchase_date', label: '购置日期' },
  { key: 'remark', label: '备注' }
]

export const studentAllColumns: Array<{ key: string; label: string }> = [
  { key: 'username', label: '用户名' },
  { key: 'student_id', label: '学号' },
  { key: 'student_grade', label: '年级' },
  { key: 'student_major', label: '专业' },
  { key: 'student_email', label: '邮箱' },
  { key: 'graduate_year', label: '毕业年份' },
  { key: 'student_phone', label: '手机号' },
  { key: 'student_id_card', label: '身份证号' },
  { key: 'student_bank_card', label: '银行卡号' },
  { key: 'student_bank_name', label: '开户行' },
  { key: 'create_time', label: '创建时间' }
]
