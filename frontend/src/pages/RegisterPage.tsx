import { useState, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Form, Input, Button, Select, message } from 'antd'
import { UserOutlined, LockOutlined, IdcardOutlined, MailOutlined, SafetyOutlined } from '@ant-design/icons'
import { useAuth, useMajorList } from '@/contexts'
import { gradeOptions } from '@/config'
import api from '@/api'
/* 
已经废弃

*/
export default function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const majorList = useMajorList()
  const [loading, setLoading] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')
  const [form] = Form.useForm()

  const fetchCaptcha = useCallback(async () => {
    try {
      const res = await api.get('/captcha')
      setCaptchaId(res.data.captchaId)
      setCaptchaSvg(res.data.captcha)
      form.setFieldValue('captcha', '')
    } catch (err) {
      console.error('获取验证码失败:', err)
    }
  }, [form])

  useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  const handleFinish = async (values: Record<string, string>) => {
    setLoading(true)
    try {
      const { confirmPassword, captcha, ...rest } = values
      void confirmPassword
      void captcha
      await register({ ...rest, role: 'student', captchaId, captchaText: values.captcha })
      message.success('注册成功')
      navigate('/student/dashboard')
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || '注册失败'
      message.error(errorMsg)
      fetchCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-page-shell">
      <div className="register-hero-card">
        <div className="register-hero-visual">
          <div className="register-orbit orbit-a" />
          <div className="register-orbit orbit-b" />
          <div className="register-building" />
          <div className="register-glow" />
          <div className="register-visual-content">
            <h2>工作进度管理系统</h2>
            <p>学生注册入口</p>
          </div>
        </div>

        <div className="register-panel">
          <div className="register-title-group">
            <h1>学生注册</h1>
            <p>STUDENT REGISTER</p>
          </div>

          <Form form={form} layout="vertical" onFinish={handleFinish} className="register-form" autoComplete="off">
            <Form.Item name="username" rules={[
              { required: true, message: '请输入用户名' },
              { max: 20, message: '用户名不能超过20个字符' },
              { pattern: /^[\u4e00-\u9fa5]+$/, message: '用户名必须为中文字符' }
            ]}>
              <Input size="large" prefix={<UserOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="请输入中文用户名" maxLength={20} autoComplete="off" />
            </Form.Item>
            <Form.Item name="student_id" rules={[
              { required: true, message: '请输入学号' },
              { max: 12, message: '学号不超过12位' },
              { pattern: /^[A-Za-z0-9]+$/, message: '仅允许字母和数字' }
            ]}>
              <Input size="large" prefix={<IdcardOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="请输入学号" maxLength={12} autoComplete="off" />
            </Form.Item>
            <Form.Item name="student_grade" rules={[{ required: true, message: '请选择年级' }]}>
              <Select size="large" placeholder="请选择年级" options={gradeOptions} />
            </Form.Item>
            <Form.Item name="graduate_year" rules={[{ required: true, message: '请选择毕业年份' }]}>
              <Select size="large" placeholder="请选择毕业年份" options={
                Array.from({ length: 17 }, (_, i) => ({
                  value: String(2024 + i),
                  label: String(2024 + i)
                }))
              } />
            </Form.Item>
            <Form.Item name="student_major" rules={[{ required: true, message: '请选择专业' }]}>
              <Select size="large" placeholder="请选择专业" showSearch allowClear options={[
                { value: '计算机科学与技术', label: '计算机科学与技术' },
                { value: '计算机应用', label: '计算机应用' },
                { value: '软件工程', label: '软件工程' },
                { value: '人工智能', label: '人工智能' },
                ...majorList.filter(m => !['计算机科学与技术', '计算机应用', '软件工程', '人工智能'].includes(m)).map(m => ({ value: m, label: m }))
              ]} />
            </Form.Item>
            <Form.Item name="student_email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入正确的邮箱格式' }]}>
              <Input size="large" prefix={<MailOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="请输入邮箱" autoComplete="off" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码长度不能少于6位' }]}>
              <Input.Password size="large" prefix={<LockOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="请设置密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve()
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  }
                })
              ]}
            >
              <Input.Password size="large" prefix={<LockOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="请再次输入密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="captcha" rules={[{ required: true, message: '请输入验证码' }]}>
              <div className="captcha-row-attachment">
                <Input size="large" prefix={<SafetyOutlined style={{ fontSize: 20, width: 30, textAlign: 'center' }} />} placeholder="输入验证码" />
                <button
                  className="captcha-box-attachment"
                  type="button"
                  onClick={fetchCaptcha}
                  title="点击刷新验证码"
                  aria-label="刷新验证码"
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                />
              </div>
            </Form.Item>

            <Button htmlType="submit" type="primary" size="large" block loading={loading} className="attachment-login-button">
              注 册
            </Button>
          </Form>

          <div className="login-register-tip">
            <span>已有账号？</span>
            <Link to="/login">立即登录</Link>
          </div>
        </div>
      </div>
    </div>
  )
}