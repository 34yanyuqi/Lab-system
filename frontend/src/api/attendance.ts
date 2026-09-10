import api from './axios'
import type { AttendanceOverview, AttendanceRecord, AttendanceStudentSummary, AttendancePermission } from '@/types'

interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

interface AttendanceImportData {
  batchId: string
  imported: number
  skipped: number
  details: {
    notInGroup: number
    rest: number
    duplicate: number
  }
}

export const attendanceApi = {
  uploadExcel: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<ApiResponse<AttendanceImportData>>('/attendance/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  // 单月总览：后端 /overview 只接受 month + grade
  getOverview: (month?: string, grade?: string) =>
    api.get<ApiResponse<AttendanceOverview>>('/attendance/overview', { params: { month, grade } }),

  getRecords: (month?: string, name?: string) =>
    api.get<ApiResponse<{ month: string; records: AttendanceRecord[] }>>('/attendance/records', { params: { month, name } }),

  getStudentDetail: (name: string, month?: string) =>
    api.get<ApiResponse<{ name: string; month: string; records: AttendanceRecord[] }>>(`/attendance/student/${encodeURIComponent(name)}`, { params: { month } }),

  getStudentSummary: (name: string, month?: string) =>
    api.get<ApiResponse<AttendanceStudentSummary>>(`/attendance/student/${encodeURIComponent(name)}/summary`, { params: { month } }),

  updateRecord: (id: number, data: {
    morning_on_time?: string
    morning_off_time?: string
    afternoon_on_time?: string
    afternoon_off_time?: string
  }) => api.put<ApiResponse<AttendanceRecord>>(`/attendance/record/${id}`, data),

  getPermissions: () =>
    api.get<ApiResponse<AttendancePermission[]>>('/attendance/permissions'),

  grantPermission: (studentId: number, canUpload: boolean, canEdit: boolean) =>
    api.post<ApiResponse<null>>('/attendance/permissions', {
      student_id: studentId,
      can_upload: canUpload,
      can_edit: canEdit
    }),

  revokePermission: (studentId: number) =>
    api.delete<ApiResponse<null>>(`/attendance/permissions/${studentId}`),

  deleteRecords: (month: string) =>
    api.delete<ApiResponse<{ deleted: number; month: string }>>('/attendance/records', { params: { month } }),

  getMyPermission: () =>
    api.get<ApiResponse<{ can_upload: boolean; can_edit: boolean; is_teacher: boolean }>>('/attendance/my-permission'),

  getAnomalyRecords: (month?: string, grade?: string) =>
    api.get<ApiResponse<{
      month: string
      anomalyRecords: Array<{
        date: string
        name: string
        punchType: string
        anomalyType: string
        color: string
        grade?: string
      }>
      grades: string[]
    }>>('/attendance/anomaly-records', { params: { month, grade } }),

  getOverviewRange: (startMonth?: string, endMonth?: string, grade?: string) =>
    api.get<ApiResponse<AttendanceOverview>>('/attendance/overview-range', { params: { startMonth, endMonth, grade } }),

  getStudentOverviewRange: (name: string, startMonth?: string, endMonth?: string) =>
    api.get<ApiResponse<AttendanceStudentSummary>>(`/attendance/student/${encodeURIComponent(name)}/overview-range`, { params: { startMonth, endMonth } }),
}
