import api from './axios'

export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  content: string
  /** 后端以 0/1 存储 */
  is_read: number
  related_id?: number
  created_at: string
}

export const notificationApi = {
  getNotifications: () => api.get<Notification[]>('/notifications'),
  markAsRead: (id: number) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  deleteNotification: (id: number) => api.delete(`/notifications/${id}`),
  getUnreadCount: () => api.get<{ unreadCount: number }>('/notifications/unread-count')
}
