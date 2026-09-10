import api from './axios'

export interface Task {
  id: number
  title: string
  type: string
  content: string
  teacher_id: number
  student_ids: string
  end_date: string
  check_frequency: number
  doc_url: string
  status: string
  create_time: string
}

export const taskApi = {
  getTasks: () => api.get<Task[]>('/tasks'),
  getTask: (id: number) => api.get<Task>(`/tasks/${id}`),
  createTask: (data: FormData | Partial<Task>) => api.post<Task>('/tasks', data),
  updateTask: (id: number, data: FormData | Partial<Task>) => api.put<Task>(`/tasks/${id}`, data),
  deleteTask: (id: number) => api.delete(`/tasks/${id}`),
  uploadContentImage: (file: File) => {
    const formData = new FormData()
    formData.append('content_image', file)
    return api.post<{ url: string; name?: string }>('/tasks/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  // 周报统计由 /api/users/weekly-stats 提供
  getWeeklyStats: () => api.get('/users/weekly-stats')
}
