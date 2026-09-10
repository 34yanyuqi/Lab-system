import api from './axios'

/** 与 backend/routes/equipments.js 的表结构保持一致 */
export interface Equipment {
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
  remark?: string
  image_url?: string
}

export const equipmentApi = {
  getEquipments: (params?: { student_school_id?: string; category?: string }) =>
    api.get<Equipment[]>('/equipments', { params }),
  getEquipment: (id: number) => api.get<Equipment>(`/equipments/${id}`),
  createEquipment: (data: Partial<Equipment>) => api.post<Equipment>('/equipments', data),
  updateEquipment: (id: number, data: Partial<Equipment>) => api.put<Equipment>(`/equipments/${id}`, data),
  deleteEquipment: (id: number) => api.delete(`/equipments/${id}`),
  batchDeleteEquipments: (ids: number[]) => api.post('/equipments/batch-delete', { ids }),
  // 学生领用/归还（后端为 PUT，且以当前登录学生为准）
  borrowEquipment: (id: number) => api.put<Equipment>(`/equipments/${id}/borrow`),
  returnEquipment: (id: number) => api.put<Equipment>(`/equipments/${id}/return`),
  uploadImage: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('equipment_image', file)
    return api.post<Equipment>(`/equipments/${id}/upload-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteImage: (id: number) => api.delete(`/equipments/${id}/image`)
}
