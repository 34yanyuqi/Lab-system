import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ActivatePage from '@/pages/ActivatePage'
import HomeRedirect from '@/pages/HomeRedirect'
import ProfilePage from '@/pages/ProfilePage'

import TeacherDashboardPage from '@/pages/teacher/DashboardPage'
import TeacherTasksPage from '@/pages/teacher/TasksPage'
import TeacherCheckPage from '@/pages/teacher/CheckPage'
import TeacherBatchReviewPage from '@/pages/teacher/BatchReviewPage'
import TeacherStatisticsPage from '@/pages/teacher/StatisticsPage'
import TeacherStudentsPage from '@/pages/teacher/StudentsPage'
import TeacherEquipmentsPage from '@/pages/teacher/EquipmentsPage'
import TeacherAttendancePage from '@/pages/teacher/AttendancePage'
import TeacherAttendanceDetailPage from '@/pages/teacher/AttendanceDetailPage'
import TeacherAttendancePermissionPage from '@/pages/teacher/AttendancePermissionPage'


import StudentHomePage from '@/pages/student/HomePage'
import StudentDashboardPage from '@/pages/student/DashboardPage'
import StudentSubmitPage from '@/pages/student/SubmitPage'
import StudentEquipmentsPage from '@/pages/student/EquipmentsPage'
import StudentAttendancePage from '@/pages/student/AttendancePage'
import StudentAttendanceManagePage from '@/pages/student/AttendanceManagePage'
import StudentAttendanceDetailPage from '@/pages/student/AttendanceDetailPage'


export default function Router() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/activate" element={<ActivatePage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<ProtectedRoute role="teacher" />}>
        <Route
          path="/teacher"
          element={<AppLayout role="teacher" />}
        >
          <Route index element={<Navigate to="/teacher/dashboard" />} />
          <Route path="dashboard" element={<TeacherDashboardPage />} />
          <Route path="tasks" element={<TeacherTasksPage />} />
          <Route path="check" element={<TeacherCheckPage />} />
          <Route path="batch-review" element={<TeacherBatchReviewPage />} />
          <Route path="statistics" element={<TeacherStatisticsPage />} />
          <Route path="students" element={<TeacherStudentsPage />} />
          <Route path="equipments" element={<TeacherEquipmentsPage />} />
          <Route path="attendance" element={<TeacherAttendancePage />} />
          <Route path="attendance/student/:name" element={<TeacherAttendanceDetailPage />} />
          <Route path="attendance/permissions" element={<TeacherAttendancePermissionPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="student" />}>
        <Route
          path="/student"
          element={<AppLayout role="student" />}
        >
          <Route index element={<StudentHomePage />} />
          <Route path="home" element={<StudentHomePage />} />
          <Route path="dashboard" element={<StudentDashboardPage />} />
          <Route path="submit/:taskId" element={<StudentSubmitPage />} />
          <Route path="equipments" element={<StudentEquipmentsPage />} />
          <Route path="attendance" element={<StudentAttendancePage />} />
          <Route path="attendance-manage" element={<StudentAttendanceManagePage />} />
          <Route path="attendance/detail/:name" element={<StudentAttendanceDetailPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  )
}