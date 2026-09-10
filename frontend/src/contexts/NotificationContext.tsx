import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import api from '@/api'
import { useAuth } from './AuthContext'

export interface Notification {
  id: number
  user_id: number
  type: 'task_assign' | 'task_deadline' | 'review_result' | 'system'
  title: string
  content: string
  related_id?: number
  is_read: number
  created_at: string
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  fetchNotifications: () => Promise<void>
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: number) => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchNotifications = useCallback(async () => {
    // 未登录时不请求接口，否则登录页会不断触发 401 并被拦截器重定向
    if (!isAuthenticated) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    setLoading(true)
    try {
      const response = await api.get('/notifications')
      const data = response.data
      const notificationList = Array.isArray(data) ? data : []
      setNotifications(notificationList)
      setUnreadCount(notificationList.filter((n: Notification) => n.is_read === 0).length)
    } catch (error) {
      console.error('获取通知失败:', error)
      setNotifications([])
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  const markAsRead = useCallback(async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error('标记已读失败:', error)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await api.put('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch (error) {
      console.error('标记全部已读失败:', error)
    }
  }, [])

  const deleteNotification = useCallback(async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`)
      const deleted = notifications.find(n => n.id === id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      if (deleted && deleted.is_read === 0) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('删除通知失败:', error)
    }
  }, [notifications])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}