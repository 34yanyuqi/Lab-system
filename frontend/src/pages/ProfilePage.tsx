import { useState, useEffect, useCallback } from 'react'
import { Card, Form, Input, Button, Select, Row, Col, Space, Table, message, Modal, Typography, Tag, Divider } from 'antd'
import { MailOutlined, LockOutlined, CheckCircleOutlined, WarningOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useAuth, useMajorList } from '@/contexts'
import api from '@/api'
import { gradeOptions } from '@/config'
import type { EquipmentItem, User } from '@/types'

const { Text } = Typography

export default function ProfilePage() {
  const { user, fetchProfile, updateProfile, setUser } = useAuth()
  const majorList = useMajorList()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [myEquipments, setMyEquipments] = useState<EquipmentItem[]>([])
  const isTeacher = user?.role === 'teacher'

  const [emailVerified, setEmailVerified] = useState(false)
  const [hasEmail, setHasEmail] = useState(false)
  const currentEmail = user ? (isTeacher ? user.teacher_email : user.student_email) : ''

  useEffect(() => {
    if (!isTeacher && user?.student_id) {
      api.get<EquipmentItem[]>('/equipments', { params: { student_school_id: user.student_id } })
        .then(res => setMyEquipments(Array.isArray(res.data) ? res.data : []))
        .catch(() => setMyEquipments([]))
    }
  }, [isTeacher, user?.student_id])

  const fillForm = useCallback((profile: User) => {
    const normalizeGrade = (v: string) => (v || '').replace(/级$/, '')
    form.setFieldsValue({
      username: profile.username || '',
      teacher_name: profile.teacher_name || '',
      teacher_phone: profile.teacher_phone || '',
      student_id: profile.student_id || '',
      student_grade: normalizeGrade(profile.student_grade || ''),
      student_major: profile.student_major || '',
      graduate_year: (profile.graduate_year || '').replace(/级$/, ''),
      student_phone: profile.student_phone || '',
      student_id_card: profile.student_id_card || '',
      student_bank_card: profile.student_bank_card || '',
      student_bank_name: profile.student_bank_name || ''
    })
  }, [form])

  // 合并原先两个重复的挂载请求：一次拉取完成表单回填与邮箱状态同步
  useEffect(() => {
    let cancelled = false
    fetchProfile()
      .then(profile => {
        if (cancelled) return
        fillForm(profile)
        setEmailVerified(profile.email_verified === 1)
        setHasEmail(!!(profile.role === 'teacher' ? profile.teacher_email : profile.student_email))
      })
      .catch(() => {
        if (!cancelled) message.error('加载个人信息失败')
      })
    return () => { cancelled = true }
  }, [fetchProfile, fillForm])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const payload = isTeacher
        ? {
            username: values.username,
            teacher_name: values.teacher_name,
            teacher_phone: values.teacher_phone
          }
        : {
            username: values.username,
            student_id: values.student_id,
            student_grade: values.student_grade,
            student_major: values.student_major,
            graduate_year: values.graduate_year,
            student_phone: values.student_phone,
            student_id_card: values.student_id_card,
            student_bank_card: values.student_bank_card,
            student_bank_name: values.student_bank_name
          }

      const nextUser = await updateProfile(payload)
      fillForm(nextUser)
      message.success('个人信息已更新')
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.error || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="card-head">
          <div>
            <h3>个人信息维护</h3>
            <p>支持维护当前账号基础资料</p>
          </div>
        </div>
        <Form form={form} layout="horizontal" className="hform" labelCol={{ flex: '80px' }} wrapperCol={{ flex: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="账号角色">
                <Input value={isTeacher ? '导师' : '学生'} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="username" label="用户名" rules={[
                { required: true, message: '请输入用户名' },
                { max: 20, message: '用户名不能超过20个字符' },
                { pattern: /^[\u4e00-\u9fa5]+$/, message: '用户名必须为中文字符' }
              ]}>
                <Input placeholder="请输入中文用户名" maxLength={20} />
              </Form.Item>
            </Col>
          </Row>
          {isTeacher ? (
            <>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="teacher_name" label="导师姓名" rules={[{ required: true, message: '请输入导师姓名' }]}>
                    <Input placeholder="请输入导师姓名" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="teacher_phone" label="联系电话" rules={[{ required: true, message: '请输入联系电话' }]}>
                    <Input placeholder="请输入联系电话" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          ) : (
            <>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="student_id" label="学号" rules={[{ required: true, message: '请输入学号' }, { max: 12, message: '学号不超过12位' }, { pattern: /^[A-Za-z0-9]+$/, message: '仅允许字母和数字' }]}>
                    <Input placeholder="请输入学号" maxLength={12} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="student_grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}>
                    <Select placeholder="请选择年级" options={gradeOptions} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="graduate_year" label="毕业年份" rules={[{ required: true, message: '请选择毕业年份' }]}>
                    <Select placeholder="请选择毕业年份" options={
                      Array.from({ length: 17 }, (_, i) => ({
                        value: String(2024 + i),
                        label: String(2024 + i)
                      }))
                    } />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="student_major" label="专业" rules={[{ required: true, message: '请选择专业' }]}>
                    <Select placeholder="请选择专业" showSearch allowClear options={[
                      { value: '计算机科学与技术', label: '计算机科学与技术' },
                      { value: '计算机应用', label: '计算机应用' },
                      { value: '软件工程', label: '软件工程' },
                      { value: '人工智能', label: '人工智能' },
                      ...majorList.filter(m => !['计算机科学与技术', '计算机应用', '软件工程', '人工智能'].includes(m)).map(m => ({ value: m, label: m }))
                    ]} />
                  </Form.Item>
                </Col>
                <Col span={12} />
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="student_phone" label="手机号" rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号格式' }]}>
                    <Input placeholder="请输入手机号" maxLength={11} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="student_id_card" label="身份证号" rules={[{ pattern: /^\d{17}[\dXx]$/, message: '请输入正确的身份证号格式' }]}>
                    <Input placeholder="请输入身份证号" maxLength={18} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="student_bank_card" label="银行卡号" rules={[{ pattern: /^\d{16,19}$/, message: '请输入正确的银行卡号格式' }]}>
                    <Input placeholder="请输入银行卡号" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="student_bank_name" label="开户行">
                    <Input placeholder="请输入开户行名称" />
                  </Form.Item>
                </Col>
              </Row>
              {myEquipments.length > 0 && (
                <fieldset className="fieldset-group" style={{ marginTop: 16 }}>
                  <legend>实验设备</legend>
                  <Table
                    dataSource={myEquipments}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: '类别', dataIndex: 'category', width: 80 },
                      { title: '校内编号', dataIndex: 'school_code', width: 100 },
                      { title: '设备名称', dataIndex: 'name', width: 120 },
                      { title: '型号', dataIndex: 'model', width: 100 },
                      { title: '序列号', dataIndex: 'serial_number', width: 120 },
                      { title: '价值', dataIndex: 'value', width: 80 },
                      { title: '存放地址', dataIndex: 'location', width: 120 },
                      { title: '购置日期', dataIndex: 'purchase_date', width: 100 },
                      { title: '备注', dataIndex: 'remark', width: 120 }
                    ]}
                  />
                </fieldset>
              )}
            </>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" loading={loading} onClick={handleSave}>保存修改</Button>
              <Button onClick={() => fetchProfile().then(profile => { fillForm(profile); setUser(profile) })}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Divider />

      <EmailSection
        currentEmail={currentEmail}
        hasEmail={hasEmail}
        emailVerified={emailVerified}
        isTeacher={isTeacher}
        user={user}
        onRefresh={() => {
          fetchProfile().then(profile => {
            setEmailVerified(profile.email_verified === 1)
            setHasEmail(!!(isTeacher ? profile.teacher_email : profile.student_email))
            setUser(profile)
          })
        }}
      />

      <Divider />

      <PasswordSection
        email={currentEmail}
        hasEmail={hasEmail}
        emailVerified={emailVerified}
      />

      <Divider />

      <PinSection />
    </div>
  )
}

function EmailSection({
  currentEmail,
  hasEmail,
  emailVerified,
  isTeacher,
  user,
  onRefresh
}: {
  currentEmail: string | undefined
  hasEmail: boolean
  emailVerified: boolean
  isTeacher: boolean
  user: User | null
  onRefresh: () => void
}) {
  const [bindModalOpen, setBindModalOpen] = useState(false)
  const [changeModalOpen, setChangeModalOpen] = useState(false)
  const [activateModalOpen, setActivateModalOpen] = useState(false)
  const [bindStep, setBindStep] = useState<'send' | 'verify'>('send')
  const [changeStep, setChangeStep] = useState<'send' | 'verify'>('send')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [code, setCode] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [activateCode, setActivateCode] = useState('')

  const handleSendBindCode = async () => {
    if (!targetEmail) {
      message.warning('请输入邮箱地址')
      return
    }
    setSending(true)
    try {
      await api.post('/email/send-bind-code', { email: targetEmail })
      message.success('验证码已发送，请查收邮件')
      setBindStep('verify')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleBindEmail = async () => {
    if (!code) {
      message.warning('请输入验证码')
      return
    }
    setVerifying(true)
    try {
      await api.post('/email/bind', { email: targetEmail, code: code.toUpperCase() })
      message.success('邮箱绑定成功')
      setBindModalOpen(false)
      resetBind()
      onRefresh()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '绑定失败')
    } finally {
      setVerifying(false)
    }
  }

  const resetBind = () => {
    setBindStep('send')
    setTargetEmail('')
    setCode('')
  }

  const handleSendActivation = async () => {
    setSending(true)
    try {
      await api.post('/email/send-activation')
      message.success('激活验证码已发送，请查收邮件')
      setActivateModalOpen(true)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleActivate = async (codeOverride?: string) => {
    const finalCode = codeOverride || activateCode
    if (!finalCode || finalCode.length !== 6) {
      message.warning('请输入完整的6位验证码')
      return
    }
    setVerifying(true)
    try {
      await api.post('/email/activate', { email: currentEmail, code: finalCode.toUpperCase() })
      message.success('邮箱验证成功')
      setActivateModalOpen(false)
      setActivateCode('')
      onRefresh()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '激活失败')
    } finally {
      setVerifying(false)
    }
  }

  const handleResendActivation = async () => {
    setSending(true)
    try {
      await api.post('/email/send-activation')
      message.success('验证码已重新发送')
      setActivateCode('')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleSendChangeCode = async () => {
    if (!currentEmail) return
    setSending(true)
    try {
      await api.post('/email/send-verification', { email: currentEmail, type: 'change_email' })
      message.success('验证码已发送到当前邮箱')
      setChangeStep('verify')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleChangeEmail = async () => {
    if (!code || !newEmail) {
      message.warning('请填写完整信息')
      return
    }
    setVerifying(true)
    try {
      await api.post('/email/change', { old_email: currentEmail, code: code.toUpperCase(), new_email: newEmail })
      message.success('邮箱已更换，请前往新邮箱完成验证')
      setChangeModalOpen(false)
      resetChange()
      onRefresh()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '更换失败')
    } finally {
      setVerifying(false)
    }
  }

  const resetChange = () => {
    setChangeStep('send')
    setCode('')
    setNewEmail('')
  }

  return (
    <Card className="compact-card" title={<><MailOutlined /> 邮箱管理</>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Text strong>当前邮箱：</Text>
          {hasEmail ? (
            <Text>{currentEmail}</Text>
          ) : (
            <Tag color="red" icon={<ExclamationCircleOutlined />}>未绑定</Tag>
          )}
          {hasEmail && emailVerified && (
            <Tag color="green" icon={<CheckCircleOutlined />} style={{ marginLeft: 8 }}>已验证</Tag>
          )}
          {hasEmail && !emailVerified && (
            <Tag color="orange" icon={<WarningOutlined />} style={{ marginLeft: 8 }}>未验证</Tag>
          )}
        </div>
        <Space>
          {!hasEmail && (
            <Button type="primary" icon={<MailOutlined />} onClick={() => { resetBind(); setBindModalOpen(true) }}>
              绑定邮箱
            </Button>
          )}
          {hasEmail && !emailVerified && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSendActivation} loading={sending}>
              发送验证邮件
            </Button>
          )}
          {hasEmail && emailVerified && (
            <Button icon={<MailOutlined />} onClick={() => { resetChange(); setChangeModalOpen(true) }}>
              更换邮箱
            </Button>
          )}
        </Space>
      </div>

      <Modal
        title="绑定邮箱"
        open={bindModalOpen}
        onCancel={() => { setBindModalOpen(false); resetBind() }}
        footer={null}
        destroyOnClose
      >
        {bindStep === 'send' ? (
          <div>
            <p>请输入要绑定的邮箱地址，系统将发送验证码。</p>
            <Input
              placeholder="请输入邮箱地址"
              value={targetEmail}
              onChange={e => setTargetEmail(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" block loading={sending} onClick={handleSendBindCode}>
              发送验证码
            </Button>
          </div>
        ) : (
          <div>
            <p>验证码已发送至 <Text strong>{targetEmail}</Text>，请输入验证码完成绑定。</p>
            <Input
              placeholder="请输入6位验证码"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={6}
              style={{ marginBottom: 16 }}
            />
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setBindStep('send')}>返回修改邮箱</Button>
              <Button type="primary" loading={verifying} onClick={handleBindEmail}>
                验证并绑定
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      <Modal
        title="更换邮箱"
        open={changeModalOpen}
        onCancel={() => { setChangeModalOpen(false); resetChange() }}
        footer={null}
        destroyOnClose
      >
        {changeStep === 'send' ? (
          <div>
            <p>更换邮箱需要先验证当前邮箱 <Text strong>{currentEmail}</Text>。</p>
            <Button type="primary" block loading={sending} onClick={handleSendChangeCode}>
              发送验证码到当前邮箱
            </Button>
          </div>
        ) : (
          <div>
            <p>验证码已发送至 <Text strong>{currentEmail}</Text>。</p>
            <Input
              placeholder="请输入6位验证码"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={6}
              style={{ marginBottom: 12 }}
            />
            <Input
              placeholder="请输入新邮箱地址"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setChangeStep('send')}>返回</Button>
              <Button type="primary" loading={verifying} onClick={handleChangeEmail}>
                确认更换
              </Button>
            </Space>
          </div>
        )}
      </Modal>

      <Modal
        title="邮箱激活"
        open={activateModalOpen}
        onCancel={() => { setActivateModalOpen(false); setActivateCode('') }}
        footer={null}
        destroyOnClose
        width={440}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 20, color: '#555', fontSize: 14 }}>
            验证码已发送至 <Text strong>{currentEmail}</Text>
          </p>

          <div className="modal-code-input-container">
            <Row gutter={10} justify="center">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Col key={index}>
                  <input
                    type="text"
                    maxLength={2}
                    value={activateCode[index] || ''}
                    onChange={(e) => {
                      const input = e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
                      const newCode = activateCode.split('')

                      if (input.length > 1) {
                        const chars = input.split('')
                        chars.forEach((char, i) => {
                          if (index + i < 6 && char) newCode[index + i] = char
                        })
                        const newValue = newCode.join('').substring(0, 6)
                        setActivateCode(newValue)
                        if (newValue.length === 6) {
                          setTimeout(() => handleActivate(newValue), 200)
                        }
                        const nextIndex = Math.min(index + chars.length, 5)
                        const nextEl = document.querySelector(`[data-code-idx="${nextIndex}"]`) as HTMLInputElement
                        nextEl?.focus()
                      } else if (input) {
                        newCode[index] = input
                        const newValue = newCode.join('')
                        setActivateCode(newValue)
                        if (newValue.length === 6) {
                          setTimeout(() => handleActivate(newValue), 200)
                        } else if (index < 5) {
                          const nextEl = document.querySelector(`[data-code-idx="${index + 1}"]`) as HTMLInputElement
                          nextEl?.focus()
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace') {
                        if (!activateCode[index] && index > 0) {
                          const newCode = activateCode.split('')
                          newCode[index - 1] = ''
                          setActivateCode(newCode.join(''))
                          const prevEl = document.querySelector(`[data-code-idx="${index - 1}"]`) as HTMLInputElement
                          prevEl?.focus()
                        } else {
                          const newCode = activateCode.split('')
                          newCode[index] = ''
                          setActivateCode(newCode.join(''))
                        }
                      } else if (e.key === 'ArrowLeft' && index > 0) {
                        const prevEl = document.querySelector(`[data-code-idx="${index - 1}"]`) as HTMLInputElement
                        prevEl?.focus()
                      } else if (e.key === 'ArrowRight' && index < 5) {
                        const nextEl = document.querySelector(`[data-code-idx="${index + 1}"]`) as HTMLInputElement
                        nextEl?.focus()
                      }
                    }}
                    className="modal-code-input"
                    data-code-idx={index}
                    inputMode="text"
                    autoComplete="off"
                  />
                </Col>
              ))}
            </Row>
          </div>

          <p style={{ color: '#999', fontSize: 13, margin: '12px 0 20px' }}>
            
          </p>

          <Button
            loading={sending}
            onClick={handleResendActivation}
            style={{ color: '#6366f1' }}
          >
            重新发送验证码
          </Button>
        </div>

        <style>{`
          .modal-code-input-container {
            padding: 4px 0;
          }
          .modal-code-input {
            width: 50px;
            height: 56px;
            text-align: center;
            font-size: 24px;
            font-weight: 600;
            color: var(--text-primary);
            border: 2px solid var(--border-strong);
            border-radius: 10px;
            background: var(--input-bg);
            outline: none;
            transition: all 0.25s ease;
            box-shadow: var(--shadow-sm);
          }
          .modal-code-input:focus {
            border-color: #6366f1;
            box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
            transform: translateY(-2px);
          }
          .modal-code-input:hover:not(:focus) {
            border-color: #ccc;
          }
        `}</style>
      </Modal>
    </Card>
  )
}

function PinSection() {
  const { user, fetchProfile } = useAuth()
  const isTeacher = user?.role === 'teacher'
  const currentEmail = user ? (isTeacher ? user.teacher_email : user.student_email) : ''
  const hasEmail = !!currentEmail

  const colorDigits = [
    { digit: '0', color: '#ef4444', name: '红' },
    { digit: '1', color: '#f97316', name: '橙' },
    { digit: '2', color: '#eab308', name: '黄' },
    { digit: '3', color: '#22c55e', name: '绿' },
    { digit: '4', color: '#06b6d4', name: '青' },
    { digit: '5', color: '#3b82f6', name: '蓝' },
    { digit: '6', color: '#6366f1', name: '靛' },
    { digit: '7', color: '#a855f7', name: '紫' },
    { digit: '8', color: '#ec4899', name: '粉' },
    { digit: '9', color: '#78716c', name: '灰' },
  ]

  const [hasPin, setHasPin] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<'send' | 'verify'>('send')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [pinDigits, setPinDigits] = useState<string[]>([])

  useEffect(() => {
    fetchProfile().then(profile => {
      setHasPin(profile.hasPin === true)
    }).catch(() => {})
  }, [])

  const openModal = () => {
    setModalOpen(true)
    setStep('send')
    setEmailCode('')
    setPinDigits([])
  }

  const handleSendCode = async () => {
    if (!currentEmail) return
    setSending(true)
    try {
      await api.post('/email/send-verification', { email: currentEmail, type: 'set_pin' })
      message.success('验证码已发送，请查收邮件')
      setStep('verify')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleColorClick = (digit: string) => {
    if (pinDigits.length >= 12) return
    setPinDigits(prev => [...prev, digit])
  }

  const handlePinBackspace = () => {
    setPinDigits(prev => prev.slice(0, -1))
  }

  const handlePinClear = () => {
    setPinDigits([])
  }

  const handleSavePin = async () => {
    if (!emailCode) {
      message.warning('请输入验证码')
      return
    }
    const pin = pinDigits.join('')
    if (pin.length < 8 || pin.length > 12) {
      message.warning('颜色码必须为8-12位')
      return
    }
    setLoading(true)
    try {
      await api.put('/auth/pin', { pin, emailCode })
      message.success('颜色码设置成功')
      setHasPin(true)
      setModalOpen(false)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败')
      setEmailCode('')
      setPinDigits([])
      setStep('send')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="compact-card" title={<><LockOutlined /> 快捷登录颜色码</>}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          {hasPin ? (
            <Tag color="green" icon={<CheckCircleOutlined />}>已设置</Tag>
          ) : (
            <Tag color="default">未设置</Tag>
          )}
          <Text type="secondary" style={{ marginLeft: 8 }}>
            {hasPin ? '可在魔方背面输入8-12位颜色码快速登录' : '设置后可在魔方背面使用8-12位颜色码快捷登录'}
          </Text>
        </div>
        <Button
          icon={<LockOutlined />}
          onClick={openModal}
          disabled={!hasEmail}
          title={!hasEmail ? '请先绑定邮箱' : ''}
        >
          {hasPin ? '修改颜色码' : '设置颜色码'}
        </Button>
      </div>
      {!hasEmail && (
        <div style={{ marginTop: 12, color: '#faad14', fontSize: 13 }}>
          <WarningOutlined style={{ marginRight: 6 }} />
          请先绑定并验证邮箱后才能设置快捷登录颜色码
        </div>
      )}

      <Modal
        title={hasPin ? '修改颜色码' : '设置颜色码'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnClose
        width={500}
      >
        {step === 'send' ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 8, color: 'var(--text-secondary)' }}>
              为保障安全，需要通过邮箱验证身份
            </p>
            <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 15 }}>
              {currentEmail}
            </Text>
            <Button type="primary" block loading={sending} onClick={handleSendCode}>
              发送验证码
            </Button>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
              验证码已发送至 <Text strong>{currentEmail}</Text>
            </p>
            <p style={{ marginBottom: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>
              请先输入邮箱验证码，再点击颜色块设置8-12位颜色码
            </p>

            <div style={{ marginBottom: 16 }}>
              <Input
                placeholder="请输入6位邮箱验证码"
                value={emailCode}
                onChange={e => setEmailCode(e.target.value)}
                maxLength={6}
                style={{ textAlign: 'center', fontSize: 18, letterSpacing: 4 }}
              />
            </div>

            <div className="pin-color-grid">
              {colorDigits.map(cd => (
                <button
                  key={cd.digit}
                  className="pin-color-tile"
                  style={{ backgroundColor: cd.color }}
                  onClick={() => handleColorClick(cd.digit)}
                  type="button"
                  title={cd.name}
                />
              ))}
            </div>

            <div className="pin-color-display">
              {pinDigits.map((digit, i) => {
                const cd = colorDigits.find(d => d.digit === digit)
                return (
                  <span
                    key={i}
                    className="pin-color-dot"
                    style={{ backgroundColor: cd?.color || '#444' }}
                  />
                )
              })}
              {pinDigits.length === 0 && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>点击上方颜色块设置颜色码</span>
              )}
            </div>

            <div className="pin-color-actions">
              <button
                className="pin-action-btn backspace-btn"
                onClick={handlePinBackspace}
                disabled={pinDigits.length === 0}
                type="button"
              >
                ⌫ 退格
              </button>
              <button
                className="pin-action-btn clear-btn"
                onClick={handlePinClear}
                disabled={pinDigits.length === 0}
                type="button"
              >
                清除
              </button>
            </div>

            <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button onClick={() => { setStep('send'); setEmailCode(''); setPinDigits([]) }}>
                返回重发
              </Button>
              <Button type="primary" loading={loading} onClick={handleSavePin}
                disabled={pinDigits.length < 8}>
                确认设置
              </Button>
            </Space>
          </div>
        )}
      </Modal>
    </Card>
  )
}

function PasswordSection({
  email,
  hasEmail,
  emailVerified
}: {
  email: string | undefined
  hasEmail: boolean
  emailVerified: boolean
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<'send' | 'change'>('send')
  const [sending, setSending] = useState(false)
  const [changing, setChanging] = useState(false)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const canChange = hasEmail && emailVerified && email

  const handleSendCode = async () => {
    if (!email) return
    setSending(true)
    try {
      await api.post('/email/send-password-code', { email })
      message.success('验证码已发送，请查收邮件')
      setStep('change')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败')
    } finally {
      setSending(false)
    }
  }

  const handleChangePassword = async () => {
    if (!code) {
      message.warning('请输入验证码')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      message.warning('密码长度不能少于6位')
      return
    }
    if (newPassword !== confirmPassword) {
      message.warning('两次输入的密码不一致')
      return
    }
    setChanging(true)
    try {
      await api.post('/email/change-password', { email, code: code.toUpperCase(), new_password: newPassword })
      message.success('密码修改成功，请重新登录')
      setModalOpen(false)
      resetForm()
      setTimeout(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }, 1500)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '修改失败')
    } finally {
      setChanging(false)
    }
  }

  const resetForm = () => {
    setStep('send')
    setCode('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <Card className="compact-card" title={<><LockOutlined /> 密码管理</>}>
      {!canChange ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <WarningOutlined style={{ color: '#faad14', fontSize: 18 }} />
          <Text type="secondary">
            {!hasEmail ? '请先绑定邮箱后才能修改密码' : '请先完成邮箱验证后才能修改密码'}
          </Text>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <Text>修改密码将通过 <Text strong>{email}</Text> 发送验证码进行验证。</Text>
          <Button icon={<LockOutlined />} onClick={() => { resetForm(); setModalOpen(true) }}>
            修改密码
          </Button>
        </div>
      )}

      <Modal
        title="修改密码"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); resetForm() }}
        footer={null}
        destroyOnClose
      >
        {step === 'send' ? (
          <div>
            <p>修改密码需要进行邮箱验证，验证码将发送至：</p>
            <Text strong style={{ display: 'block', marginBottom: 16 }}>{email}</Text>
            <Button type="primary" block loading={sending} onClick={handleSendCode}>
              发送验证码
            </Button>
          </div>
        ) : (
          <div>
            <p>验证码已发送至 <Text strong>{email}</Text>。</p>
            <Input
              placeholder="请输入6位验证码"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={6}
              style={{ marginBottom: 12 }}
            />
            <Input.Password
              placeholder="请输入新密码（至少6位）"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{ marginBottom: 12 }}
              minLength={6}
            />
            <Input.Password
              placeholder="请确认新密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setStep('send')}>返回</Button>
              <Button type="primary" loading={changing} onClick={handleChangePassword}>
                确认修改
              </Button>
            </Space>
          </div>
        )}
      </Modal>
    </Card>
  )
}
