export type ThemeMode = 'light' | 'dark'

export interface ThemeContextType {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

export interface User {
  id: number
  role: 'teacher' | 'student'
  username: string
  teacher_name?: string
  teacher_email?: string
  teacher_phone?: string
  student_id?: string
  student_grade?: string
  student_major?: string
  student_email?: string
  graduate_year?: string
  student_phone?: string
  student_id_card?: string
  student_bank_card?: string
  student_bank_name?: string
  email_verified?: number
  /** 后端 /auth/profile 额外返回：是否已设置快捷登录颜色码 */
  hasPin?: boolean
}

export interface TaskItem {
  id: number
  title: string
  type: string
  content: string
  teacher_id: number
  teacher_name?: string
  student_ids: number[] | string
  end_date: string
  check_frequency: number
  doc_url?: string
  doc_name?: string
  doc_file_url?: string
  doc_kind?: string
  status: string
  create_time: string
  assigned_count?: number
  submitted_count?: number
}

export interface SubmissionItem {
  id: number
  task_id: number
  student_id: string
  student_school_id?: string
  student_name?: string
  student_major?: string
  student_email?: string
  task_title?: string
  submit_content?: string
  submit_file?: string
  submit_file_name?: string
  submit_file_url?: string
  submit_time: string
  check_status: 'pending' | 'approved' | 'rejected'
  check_remark?: string
  check_time?: string
  week_number?: number
}

export interface StudentItem {
  id: number
  username: string
  student_id: string
  student_grade: string
  student_major: string
  student_email: string
  graduate_year: string
  student_phone?: string
  student_id_card?: string
  student_bank_card?: string
  student_bank_name?: string
  create_time?: string
}

export interface StudentOverviewData {
  totalStudents: number
  gradeStats: Array<{ student_grade: string; count: number }>
  majorStats: Array<{ student_major: string; count: number }>
  gradeMajorStats: Array<{ student_grade: string; student_major: string; count: number }>
}

export interface StatisticsData {
  totalTasks?: number
  activeTasks?: number
  totalSubmissions?: number
  pendingSubmissions?: number
  approvedSubmissions?: number
  studentStats?: Array<{
    id: number
    student_id: string
    student_major: string
    total_submissions: number
    approved_count: number
  }>
}

export interface WeeklyStatsTask {
  id: number
  title: string
  create_time: string
  end_date: string
  student_ids: string
  status: string
}

export interface WeeklyStatsSubmission {
  task_id: number
  student_id: number
  submit_time: string
}

export interface EquipmentItem {
  id: number
  category: string
  school_code: string
  serial_number: string
  name: string
  value: string
  model: string
  teacher_name: string
  student_school_id: string
  student_name: string
  location: string
  purchase_date: string
  remark: string
  image_url?: string
}

export interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** 进度审阅消息所属学生 id（用于校验「导入导师评价」的目标学生） */
  studentId?: number
}

export interface AiChatResponse {
  success: boolean
  data: {
    message: {
      role: 'assistant'
      content: string
    }
  }
  error?: string
}

// 学生周次提交摘要（多周分析选择用）
export interface StudentWeekSubmission {
  submission_id: number
  task_id: number
  task_title: string
  week_number: number
  submit_time: string
  file_name: string
  file_url: string
  is_pdf: boolean
  student_name: string
  student_school_id: string
}

// AI 分析历史记录
export interface AiAnalysisRecord {
  id: number
  student_id: number
  student_name: string
  student_school_id: string
  task_id: number
  task_title: string
  submission_ids: number[]
  result: string
  create_time: string
}

export interface AttendanceRecord {
  id: number
  name: string
  work_date: string
  morning_on_time: string
  morning_on_result: string
  morning_off_time: string
  morning_off_result: string
  afternoon_on_time: string
  afternoon_on_result: string
  afternoon_off_time: string
  afternoon_off_result: string
  day_status?: string
  batch_id: string
}

export interface AttendanceStudentSummary {
  name: string
  grade?: string
  totalDays: number
  normalDays: number
  lateDays: number
  earlyLeaveDays: number
  missingPunchDays: number
  absenteeismDays: number
  anomalyPunches: number
  totalPunches: number
  anomalyRate: number
}

export interface AttendanceOverview {
  month: string
  students: AttendanceStudentSummary[]
}

export interface AttendancePermission {
  id: number
  student_id: number
  granted_by: number
  student_username: string
  student_major: string
  can_upload: number
  can_edit: number
  created_at: string
}

export interface AttendanceImportResult {
  success: boolean
  batchId: string
  imported: number
  skipped: number
  details: {
    notInGroup: number
    rest: number
    duplicate: number
  }
}


