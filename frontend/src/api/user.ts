import api from './axios'
import type { User } from '@/types'

export const userApi = {
  getStudents: () => api.get<User[]>('/users/students'),
  createStudent: (data: Partial<User>) => api.post<User>('/users/students', data),
  updateStudent: (id: number, data: Partial<User>) => api.put<User>(`/users/students/${id}`, data),
  deleteStudent: (id: number) => api.delete(`/users/students/${id}`),
  batchDeleteStudents: (ids: number[]) => api.post('/users/students/batch-delete', { ids }),
  getTeachers: () => api.get<User[]>('/users/teachers'),
  getStatistics: () => api.get('/users/statistics'),
  getStudentOverview: () => api.get('/users/student-overview'),
  getWeeklyStats: () => api.get('/users/weekly-stats'),
  getMajors: () => api.get<string[]>('/users/majors'),
  getGrades: () => api.get<string[]>('/users/grades')
}
