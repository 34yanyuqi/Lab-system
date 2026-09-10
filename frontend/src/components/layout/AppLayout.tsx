import { useState, useEffect, useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout, Menu, Button, Dropdown, Select, Modal, Drawer, Alert
} from 'antd'
import {
  DashboardOutlined, FileTextOutlined, CheckCircleOutlined,
  AuditOutlined, BarChartOutlined, TeamOutlined, DesktopOutlined,
  UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  BgColorsOutlined, DownOutlined, FileDoneOutlined, MenuOutlined, HomeOutlined,
  MailOutlined, WarningOutlined, ClockCircleOutlined, SunOutlined, MoonOutlined
} from '@ant-design/icons'
import { useAuth, useTheme } from '@/contexts'
import NotificationCenter from '@/components/common/NotificationCenter'
import { attendanceApi } from '@/api/attendance'

const { Header, Sider, Content, Footer } = Layout

export default function AppLayout({ role }: { role: 'teacher' | 'student' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [hasAttendancePermission, setHasAttendancePermission] = useState(false)

  const [clock, setClock] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  })

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setClock(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setCollapsed(true)
      } else {
        setCollapsed(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (role !== 'student' || !user) return
    let cancelled = false
    attendanceApi.getMyPermission()
      .then(res => {
        if (cancelled) return
        setHasAttendancePermission(Boolean(res.data.data.can_upload || res.data.data.can_edit))
      })
      .catch(() => {
        // 获取失败时按"无权限"静默降级，避免每次进入页面都弹出错误提示
        if (!cancelled) setHasAttendancePermission(false)
      })
    return () => { cancelled = true }
  }, [role, user])

  const menuItems = useMemo(() => {
    if (role === 'teacher') {
      return [
        { key: '/teacher/dashboard', icon: <DashboardOutlined />, label: '数据概览' },
        { key: '/teacher/tasks', icon: <FileTextOutlined />, label: '任务管理' },
        { key: '/teacher/check', icon: <CheckCircleOutlined />, label: '进度检查' },
        { key: '/teacher/batch-review', icon: <AuditOutlined />, label: '批量审核' },
        { key: '/teacher/statistics', icon: <BarChartOutlined />, label: '统计分析' },
        { key: '/teacher/students', icon: <TeamOutlined />, label: '学生管理' },
        { key: '/teacher/equipments', icon: <DesktopOutlined />, label: '设备管理' },
        { key: '/teacher/attendance', icon: <ClockCircleOutlined />, label: '考勤管理' },
        { key: '/teacher/profile', icon: <UserOutlined />, label: '个人信息' }
      ]
    }

    const baseStudentItems = [
      { key: '/student/home', icon: <HomeOutlined />, label: '首页' },
      { key: '/student/dashboard', icon: <FileDoneOutlined />, label: '我的任务' },
      { key: '/student/equipments', icon: <DesktopOutlined />, label: '设备管理' },
      { key: '/student/attendance', icon: <ClockCircleOutlined />, label: '我的考勤' },
    ]

    if (hasAttendancePermission) {
      baseStudentItems.push({ key: '/student/attendance-manage', icon: <ClockCircleOutlined />, label: '考勤管理' })
    }

    baseStudentItems.push({ key: '/student/profile', icon: <UserOutlined />, label: '个人信息' })

    return baseStudentItems
  }, [role, hasAttendancePermission])

  const email = role === 'teacher' ? user?.teacher_email : user?.student_email
  const emailVerified = user?.email_verified === 1
  const isProfilePage = location.pathname.endsWith('/profile')
  const showEmailWarning = !isProfilePage && (!email || !emailVerified)

  const pageTitle = useMemo(() => {
    const teacherTitles: Record<string, string> = {
      '/teacher/dashboard': '数据概览',
      '/teacher/tasks': '任务管理',
      '/teacher/check': '进度检查',
      '/teacher/statistics': '统计分析',
      '/teacher/students': '学生管理',
      '/teacher/equipments': '设备管理',
      '/teacher/attendance': '考勤管理',
      '/teacher/profile': '个人信息'
    }
    const studentTitles: Record<string, string> = {
      '/student/home': '首页',
      '/student/dashboard': '我的任务',
      '/student/equipments': '设备管理',
      '/student/attendance': '我的考勤',
      '/student/profile': '个人信息'
    }

    if (location.pathname.startsWith('/student/submit')) return '任务提交'
    if (location.pathname.startsWith('/teacher/attendance/student/')) return '考勤详情'
    if (location.pathname.startsWith('/teacher/attendance/permissions')) return '权限管理'

    if (role === 'teacher')
      return teacherTitles[location.pathname] || '导师端'
    return studentTitles[location.pathname] || '首页'
  }, [location.pathname, role])

  const dropdownItems = [
    {
      key: 'profile',
      label: '个人信息',
      onClick: () => navigate(role === 'teacher' ? '/teacher/profile' : '/student/profile')
    },
    {
      key: 'logout',
      label: '退出登录',
      onClick: () => {
        Modal.confirm({
          title: '确定要退出登录吗？',
          okText: '确定',
          cancelText: '取消',
          onOk: () => {
            logout()
            navigate('/login')
          }
        })
      }
    }
  ]

  const handleMenuClick = (key: string) => {
    navigate(key)
    setMobileMenuOpen(false)
  }

  return (
    <Layout className="portal-layout">
      <Sider
        collapsed={collapsed}
        width={240}
        collapsedWidth={84}
        className="portal-sider"
        trigger={null}
        breakpoint="lg"
      >
        <div className={`portal-logo ${collapsed ? 'collapsed' : ''}`}>
          <h2>任务管理系统</h2>
          {!collapsed && <p>{role === 'teacher' ? '导师端' : '学生端'}</p>}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname === '/student' ? '/student/home' : location.pathname]}
          items={menuItems}
          inlineCollapsed={collapsed}
          onClick={({ key }) => handleMenuClick(key)}
          className="portal-menu"
        />
      </Sider>
      
      <Drawer
        title="导航菜单"
        placement="left"
        onClose={() => setMobileMenuOpen(false)}
        open={mobileMenuOpen}
        className="mobile-drawer"
        width={280}
      >
        <Menu
            mode="inline"
            selectedKeys={[location.pathname === '/student' ? '/student/home' : location.pathname]}
            items={menuItems}
            onClick={({ key }) => handleMenuClick(key)}
            className="mobile-menu"
          />
      </Drawer>

      <Layout className="portal-main">
        <Header className="portal-header">
          <div className="portal-header-left">
            <Button
              shape="circle"
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(prev => !prev)}
              className="desktop-only"
            />
            <Button
              shape="circle"
              aria-label="打开导航菜单"
              title="导航菜单"
              icon={<MenuOutlined />}
              onClick={() => setMobileMenuOpen(true)}
              className="mobile-only"
            />
            <h3 title={pageTitle}>{pageTitle}</h3>
          </div>
          <div className="portal-header-right">
            <span className="header-clock desktop-only">{clock}</span>
            <NotificationCenter />
            <Select
              value={theme}
              onChange={setTheme}
              style={{ width: 140 }}
              size="small"
              aria-label="切换主题"
              suffixIcon={<BgColorsOutlined />}
              options={[
                { value: 'light', label: '☀ 浅色' },
                { value: 'dark', label: '🌙 暗色' }
              ]}
              className="theme-select"
            />
            <Button
              shape="circle"
              aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
              title={theme === 'dark' ? '切换到浅色模式' : '切换到暗色模式'}
              icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="mobile-only theme-toggle-mobile"
            />
            <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
              <button className="user-pill" type="button">
                <UserOutlined />
                <span className="user-name">{user?.username}</span>
                <span className="user-info">
                  {role === 'teacher' 
                    ? (user?.teacher_name ? `（${user.teacher_name}）` : '') 
                    : (user?.student_id ? `（${user.student_id}）` : '')
                  }
                </span>
                <DownOutlined />
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content className="portal-content">
          {showEmailWarning && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message={
                <span>
                  {!email
                    ? '您尚未绑定邮箱，除个人信息外其他功能暂不可用，请先完成邮箱绑定。'
                    : '您的邮箱尚未验证，除个人信息外其他功能暂不可用，请前往邮箱点击激活链接完成验证。'
                  }
                </span>
              }
              action={
                <Button
                  type="primary"
                  size="small"
                  icon={<MailOutlined />}
                  onClick={() => navigate(role === 'teacher' ? '/teacher/profile' : '/student/profile')}
                >
                  前往设置
                </Button>
              }
              style={{ marginBottom: 16, borderRadius: 8 }}
              closable
            />
          )}
          <Outlet />
        </Content>
        <Footer className="portal-footer">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
            蜀ICP备2026030725号
          </a>
        </Footer>
      </Layout>
    </Layout>
  )
}