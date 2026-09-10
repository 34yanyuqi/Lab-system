export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  HOME: '/',
  TEACHER: {
    DASHBOARD: '/teacher/dashboard',
    TASKS: '/teacher/tasks',
    CHECK: '/teacher/check',
    BATCH_REVIEW: '/teacher/batch-review',
    STATISTICS: '/teacher/statistics',
    STUDENTS: '/teacher/students',
    EQUIPMENTS: '/teacher/equipments',
    PROJECTS: '/teacher/projects',
    PROFILE: '/teacher/profile'
  },
  STUDENT: {
    HOME: '/student/home',
    DASHBOARD: '/student/dashboard',
    SUBMIT: '/student/submit',
    EQUIPMENTS: '/student/equipments',
    PROJECTS: '/student/projects',
    PROFILE: '/student/profile'
  }
} as const

export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user'
} as const

export const USER_ROLES = {
  TEACHER: 'teacher',
  STUDENT: 'student'
} as const

export const TASK_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed'
} as const

export const SUBMISSION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const

export const EQUIPMENT_STATUS = {
  AVAILABLE: 'available',
  IN_USE: 'in_use',
  MAINTENANCE: 'maintenance'
} as const

export const PROJECT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused'
} as const

export const MILESTONE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed'
} as const

export const TASK_TYPES = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  FINAL: 'final'
} as const

export const MAJORS = [
  '计算机科学与技术',
  '计算机应用',
  '软件工程',
  '人工智能'
] as const

export const CHECK_FREQUENCY = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30
} as const

export const DATE_FORMAT = 'YYYY-MM-DD'
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

export const PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const ERROR_MESSAGES = {
  NETWORK_ERROR: '网络连接失败，请检查网络',
  TIMEOUT: '请求超时，请稍后重试',
  UNAUTHORIZED: '登录已过期，请重新登录',
  FORBIDDEN: '您没有权限执行此操作',
  NOT_FOUND: '请求的资源不存在',
  SERVER_ERROR: '服务器错误，请稍后重试',
  VALIDATION_ERROR: '数据验证失败'
} as const

export const SUCCESS_MESSAGES = {
  SAVE_SUCCESS: '保存成功',
  DELETE_SUCCESS: '删除成功',
  UPDATE_SUCCESS: '更新成功',
  SUBMIT_SUCCESS: '提交成功',
  IMPORT_SUCCESS: '导入成功',
  EXPORT_SUCCESS: '导出成功'
} as const