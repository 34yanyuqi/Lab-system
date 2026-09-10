import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts'

export default function HomeRedirect() {
  const { isAuthenticated, user } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={user?.role === 'teacher' ? '/teacher/dashboard' : '/student/home'} replace />
}
