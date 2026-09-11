import { useState, useCallback, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '@/contexts'
import api from '@/api'
/* 
DJ要求的魔方
*/
export default function LoginPage() {
  const navigate = useNavigate()
  const { login, pinLogin } = useAuth()

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [loading, setLoading] = useState(false)
  const [msgText, setMsgText] = useState('请输入账号、密码和验证码')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaSvg, setCaptchaSvg] = useState('')

  const [cubeLocked, setCubeLocked] = useState(false)

  const [quickInput, setQuickInput] = useState<string[]>([])
  const [quickMsg, setQuickMsg] = useState('点击颜色块输入8-12位颜色码')
  const [pinLoading, setPinLoading] = useState(false)

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

  const sceneRef = useRef<HTMLDivElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLInputElement>(null)
  const rotationRef = useRef({ x: -25, y: 35 })
  const cubeLockedRef = useRef(false)
  const autoRotateRafRef = useRef<number>(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const updateRotation = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.style.transform =
        'rotateX(' + rotationRef.current.x + 'deg) rotateY(' + rotationRef.current.y + 'deg)'
    }
  }, [])

  const stopAutoRotate = useCallback(() => {
    if (autoRotateRafRef.current) {
      cancelAnimationFrame(autoRotateRafRef.current)
      autoRotateRafRef.current = 0
    }
  }, [])

  const startAutoRotate = useCallback(() => {
    stopAutoRotate()
    const animate = () => {
      rotationRef.current.y += 0.15
      updateRotation()
      autoRotateRafRef.current = requestAnimationFrame(animate)
    }
    autoRotateRafRef.current = requestAnimationFrame(animate)
  }, [stopAutoRotate, updateRotation])

  const resumeAutoRotateAfterDelay = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      startAutoRotate()
    }, 2000)
  }, [startAutoRotate])

  const setFront = useCallback(() => {
    stopAutoRotate()
    rotationRef.current = { x: 0, y: 0 }
    updateRotation()
  }, [stopAutoRotate, updateRotation])

  const setBack = useCallback(() => {
    stopAutoRotate()
    rotationRef.current = { x: 0, y: 180 }
    updateRotation()
  }, [stopAutoRotate, updateRotation])

  const fetchCaptcha = useCallback(async () => {
    try {
      const res = await api.get('/captcha')
      setCaptchaId(res.data.captchaId)
      setCaptchaSvg(res.data.captcha)
      setCaptcha('')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFront()

    if (!account.trim()) {
      setMsgText('请输入账号')
      accountRef.current?.focus()
      return
    }
    if (!password.trim()) {
      setMsgText('请输入密码')
      return
    }
    if (!captcha.trim()) {
      setMsgText('请输入验证码')
      return
    }

    setLoading(true)
    try {
      await login({
        username: account,
        password,
        captchaId,
        captchaText: captcha
      })
      message.success('登录成功')
      const stored = localStorage.getItem('user')
      if (stored) {
        try {
          const user = JSON.parse(stored)
          navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/home')
        } catch {
          // localStorage 中的用户信息损坏时不应阻塞登录跳转
          navigate('/')
        }
      } else {
        navigate('/')
      }
    } catch (err: any) {
      setMsgText(err.response?.data?.error || '登录失败，请重试')
      fetchCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const handleColorClick = useCallback((digit: string) => {
    setBack()
    if (quickInput.length >= 12) {
      setQuickMsg('颜色码最多12位')
      return
    }
    const next = [...quickInput, digit]
    setQuickInput(next)
    setQuickMsg('已输入 ' + next.length + '/8-12 位')
  }, [quickInput, setBack])

  const handleColorConfirm = useCallback(() => {
    if (quickInput.length < 8) {
      setQuickMsg('至少需要8位颜色码')
      return
    }
    const pin = quickInput.join('')
    setPinLoading(true)
    setQuickMsg('验证中...')
    pinLogin(pin)
      .then(() => {
        message.success('快捷登录成功')
        setQuickMsg('快捷登录成功！')
        setQuickInput([])
        setTimeout(() => {
          const stored = localStorage.getItem('user')
          if (stored) {
            try {
              const user = JSON.parse(stored)
              navigate(user.role === 'teacher' ? '/teacher/dashboard' : '/student/home')
            } catch {
              navigate('/')
            }
          }
        }, 500)
      })
      .catch((err: any) => {
        setQuickMsg(err.response?.data?.error || '颜色码错误')
        setTimeout(() => {
          setQuickInput([])
          setQuickMsg('点击颜色块输入8-12位颜色码')
        }, 2000)
      })
      .finally(() => {
        setPinLoading(false)
      })
  }, [quickInput, pinLogin, navigate])

  const handleColorBackspace = useCallback(() => {
    // 状态更新函数必须是纯函数，提示信息在外部计算
    const next = quickInput.slice(0, -1)
    setQuickInput(next)
    setQuickMsg(next.length > 0 ? '已输入 ' + next.length + '/8-12 位' : '点击颜色块输入8-12位颜色码')
  }, [quickInput])

  const handleColorClear = useCallback(() => {
    setQuickInput([])
    setQuickMsg('点击颜色块输入8-12位颜色码')
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement

    if (target.closest('.login-panel')) {
      setFront()
      return
    }

    if (target.closest('.quick-login-panel')) {
      setBack()
      return
    }

    if (target.closest('.modal-overlay')) {
      return
    }

    stopAutoRotate()
    cubeLockedRef.current = false
    setCubeLocked(false)

    const startX = e.clientX
    const startY = e.clientY
    const startRx = rotationRef.current.x
    const startRy = rotationRef.current.y

    const onMove = (me: PointerEvent) => {
      rotationRef.current.y = startRy + (me.clientX - startX) * 0.32
      rotationRef.current.x = Math.max(-68, Math.min(68, startRx - (me.clientY - startY) * 0.32))
      updateRotation()
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      resumeAutoRotateAfterDelay()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true, once: true })
  }, [setFront, setBack, stopAutoRotate, updateRotation, resumeAutoRotateAfterDelay])

  const handleInputFocus = useCallback((e: React.FocusEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.quick-login-panel')) {
      stopAutoRotate()
      setBack()
    } else {
      stopAutoRotate()
      setFront()
    }
  }, [setFront, setBack, stopAutoRotate])

  const handleInputBlur = useCallback((e: React.FocusEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.login-panel') || target.closest('.quick-login-panel')) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        const activeEl = document.activeElement
        if (activeEl && (activeEl.closest('.login-panel') || activeEl.closest('.quick-login-panel'))) {
          return
        }
        startAutoRotate()
      }, 200)
    }
  }, [startAutoRotate])

  useEffect(() => {
    startAutoRotate()
    return () => {
      stopAutoRotate()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [startAutoRotate, stopAutoRotate])

  return (
    <div
      className="cube-page-shell"
      ref={zoneRef}
      onPointerDown={handlePointerDown}
      onFocusCapture={handleInputFocus}
      onBlurCapture={handleInputBlur}
    >
      <div className="corner-tl">
        <div className="corner-logo">
          <svg viewBox="0 0 36 36" fill="none" className="corner-logo-icon">
            <rect x="6" y="10" width="24" height="22" rx="1.5" stroke="currentColor" strokeWidth="2"/>
            <path d="M6 18h24M12 10v8M18 10v8M24 10v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="18" cy="13" r="1.5" fill="currentColor"/>
          </svg>
        </div>
        <div className="corner-text-group">
          <div className="corner-title">实验室任务管理系统</div>
          <div className="corner-subtitle">LAB TASK MANAGEMENT SYSTEM</div>
        </div>
      </div>

      <div className="corner-tr">
        <span className="corner-dot">·</span>
        <span>科技驱动科研</span>
        <span className="corner-dot">·</span>
        <span>智能管理未来</span>
        <span className="corner-dot">·</span>
      </div>

      <div className="corner-bl">
        © 2026 实验室任务管理系统 版权所有 | 版本 V2.0.0
      </div>

      <div className="cube-bg-g1" />
      <div className="cube-bg-g2" />

      <div className="login-container">
        <div className="login-info">
        <div className="login-info-content">
          <div className="system-title-wrap">
            <h1 className="system-title">实验室学生科研任务</h1>
            <h2 className="system-subtitle">一体化管理平台</h2>
          </div>
          <p className="system-desc">
            高效管理科研任务·实时追踪学习进度·智能协同创新未来
          </p>
          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 9h18M9 21V9"/>
                </svg>
              </span>
              <span>任务管理</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </span>
              <span>数据分析</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </span>
              <span>协同研究</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </span>
              <span>安全可靠</span>
            </div>
          </div>
        </div>
      </div>
        
        <div className="cube-zone">
          <div className="cube-scene" ref={sceneRef}>
            <div className="cube-wrapper">
            {/* ---- 正面：账号登录 ---- */}
            <section className="cube-face cube-face-front login-face">
              <div className="login-panel">
                <div className="login-header">
                  <h2>系统登录</h2>
                </div>

                <form onSubmit={handleSubmit} autoComplete="off">
                  <label>
                    账号
                    <span className="field">
                      <input
                        ref={accountRef}
                        value={account}
                        onChange={e => setAccount(e.target.value)}
                        placeholder="请输入用户名或学号"
                        autoComplete="off"
                        required
                      />
                    </span>
                  </label>

                  <label>
                    密码
                    <span className="field">
                      <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="请输入登录密码"
                        autoComplete="new-password"
                        required
                      />
                    </span>
                  </label>

                  <div className="captcha-row">
                    <label>
                      验证码
                      <span className="field">
                        <input
                          value={captcha}
                          onChange={e => setCaptcha(e.target.value)}
                          placeholder="请输入验证码"
                          autoComplete="off"
                          required
                        />
                      </span>
                    </label>
                    <button
                      type="button"
                      className="captcha-display"
                      onClick={fetchCaptcha}
                      title="点击刷新验证码"
                      aria-label="刷新验证码"
                      dangerouslySetInnerHTML={{ __html: captchaSvg }}
                    />
                  </div>

                  <button className="submit-btn" type="submit" disabled={loading}>
                    {loading ? '登录中...' : '登 录'}
                  </button>
                </form>

                <div>
                  <div className="form-foot">
                    <span className="message">{msgText}</span>
                    
                  </div>
                </div>
              </div>
            </section>

            {/* ---- 背面：快捷登录 ---- */}
            <section className="cube-face cube-face-back quick-login-face">
              <div className="quick-login-panel">
                <div className="quick-title">
                  <h2>快捷登录</h2>
                  <p>点击颜色块输入8-12位颜色码，无需账号</p>
                </div>

                <div className="color-grid-2x5">
                  {colorDigits.map(cd => (
                    <button
                      key={cd.digit}
                      className="color-tile"
                      style={{ backgroundColor: cd.color }}
                      onClick={() => handleColorClick(cd.digit)}
                      disabled={pinLoading}
                      type="button"
                      title={cd.name}
                    />
                  ))}
                </div>

                <div className="color-input-display">
                  {quickInput.map((digit, i) => {
                    const cd = colorDigits.find(d => d.digit === digit)
                    return (
                      <span
                        key={i}
                        className="color-dot"
                        style={{ backgroundColor: cd?.color || '#444' }}
                      />
                    )
                  })}
                  {quickInput.length === 0 && (
                    <span className="color-input-placeholder">颜色码将显示在此处</span>
                  )}
                </div>

                <div className="color-action-row">
                  <button
                    className="color-action-btn backspace-btn"
                    onClick={handleColorBackspace}
                    disabled={pinLoading || quickInput.length === 0}
                    type="button"
                  >
                    ⌫ 退格
                  </button>
                  <button
                    className="color-action-btn clear-btn"
                    onClick={handleColorClear}
                    disabled={pinLoading || quickInput.length === 0}
                    type="button"
                  >
                    清除
                  </button>
                  <button
                    className="color-action-btn confirm-btn"
                    onClick={handleColorConfirm}
                    disabled={pinLoading || quickInput.length < 8}
                    type="button"
                  >
                    {pinLoading ? '验证中...' : '确定'}
                  </button>
                </div>

                <div className="quick-message">{quickMsg}</div>
              </div>
            </section>

            {/* ---- 侧面：颜色块 ---- */}
            <section className="cube-face cube-face-right color-grid green">
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
            </section>
            <section className="cube-face cube-face-left color-grid yellow">
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
            </section>
            <section className="cube-face cube-face-top color-grid orange">
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
            </section>
            <section className="cube-face cube-face-bottom color-grid white">
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
              <span className="tile" /><span className="tile" /><span className="tile" />
            </section>
          </div>
        </div>
        </div>
        
        <div className="cube-footer">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
            蜀ICP备2026030725号
          </a>
        </div>
      </div>
    </div>
  )
}
