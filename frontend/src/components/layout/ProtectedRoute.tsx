import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts'

export default function ProtectedRoute({ role }: { role?: 'teacher' | 'student' }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (role && user?.role !== role) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
