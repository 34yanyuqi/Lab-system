import { BellOutlined, BellFilled } from '@ant-design/icons'
import { useNotification } from '@/contexts/NotificationContext'

interface NotificationBadgeProps {
  onClick: () => void
}

export default function NotificationBadge({ onClick }: NotificationBadgeProps) {
  const { unreadCount, loading } = useNotification()

  return (
    <button
      type="button"
      onClick={onClick}
      className="notification-badge"
      aria-label="通知"
    >
      {loading ? (
        <BellOutlined className="notification-icon" />
      ) : (
        <BellFilled className="notification-icon" />
      )}
      {unreadCount > 0 && (
        <span className="notification-count">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}