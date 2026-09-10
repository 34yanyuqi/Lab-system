import { Popover } from 'antd';
import { CheckOutlined, DeleteOutlined, ClockCircleOutlined, FileTextOutlined, CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNotification } from '@/contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { Notification } from '@/contexts/NotificationContext';
import NotificationBadge from './NotificationBadge';

export default function NotificationCenter() {
 const { notifications, loading, markAsRead, markAllAsRead, deleteNotification } = useNotification();
 const navigate = useNavigate();
 const { user } = useAuth();

 const handleNotificationClick = (notification: Notification) => {
  if (notification.is_read === 0) {
    markAsRead(notification.id);
  }
  const isStudent = user?.role === 'student';
  
  if (notification.type === 'task_assign') {
    if (isStudent) {
      navigate('/student/dashboard');
    } else {
      navigate('/teacher/check');
    }
  } else if (notification.type === 'review_result') {
    if (isStudent) {
      navigate('/student/dashboard');
      if (notification.related_id) {
        sessionStorage.setItem('openTaskDetail', String(notification.related_id));
      }
    } else {
      navigate('/teacher/check');
      if (notification.related_id) {
        sessionStorage.setItem('openSubmissionId', String(notification.related_id));
      }
    }
  }
 };

 const getNotificationIcon = (type: string) => {
 switch (type) {
 case 'task_assign':
 return <FileTextOutlined className="text-blue-500"/>;
 case 'task_deadline':
 return <ClockCircleOutlined className="text-orange-500"/>;
 case 'review_result':
 return <CheckCircleOutlined className="text-green-500"/>;
 default:
 return <InfoCircleOutlined className="text-gray-500"/>;
 }
 };
 const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
 const content = () => (<div className="notification-center">
 <div className="notification-header">
 <span className="notification-title">消息通知</span>
 {notifications.length > 0 && (<button type="button" onClick={markAllAsRead} className="notification-mark-all">
 <CheckOutlined style={{ marginRight: 4 }}/>
 全部已读
 </button>)}
 </div>
 
 {loading ? (<div className="notification-loading">加载中...</div>) : notifications.length === 0 ? (<div className="notification-empty">
 <InfoCircleOutlined className="empty-icon"/>
 <p>暂无通知</p>
 </div>) : (<div className="notification-list">
        {notifications.map((notification: Notification) => (
          <div 
            key={notification.id} 
            className={`notification-item ${notification.is_read === 0 ? 'unread' : ''}`} 
            onClick={() => handleNotificationClick(notification)}
            style={{ cursor: 'pointer' }}
          >
            <div className="notification-icon-wrap">
              {getNotificationIcon(notification.type)}
              {notification.is_read === 0 && <span className="unread-dot"></span>}
            </div>
            <div className="notification-content">
              <h4 className="notification-item-title">{notification.title}</h4>
              <p className="notification-item-text">{notification.content}</p>
              <span className="notification-time">{formatTime(notification.created_at)}</span>
            </div>
            <div className="notification-actions">
              {notification.is_read === 0 && (
                <button 
                  type="button" 
                  onClick={(e) => {
                    e.stopPropagation();
                    markAsRead(notification.id);
                  }} 
                  className="action-btn mark-read-btn"
                  title="标记已读"
                >
                  <CheckOutlined />
                  <span>已读</span>
                </button>
              )}
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNotification(notification.id);
                }} 
                className="action-btn delete-btn"
                title="删除"
              >
                <DeleteOutlined />
              </button>
            </div>
          </div>
        ))}
      </div>)}
 </div>);
 return (<Popover placement="bottomRight" content={content} trigger="click" overlayClassName="notification-popover">
 <NotificationBadge onClick={() => { }}/>
 </Popover>);
}

