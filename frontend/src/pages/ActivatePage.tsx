import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, Button, message, Typography, Row, Col } from 'antd'
import axios from 'axios'

const { Title } = Typography

interface CodeInputProps {
  value: string
  onChange: (value: string) => void
  onComplete: (value: string) => void
}

function CodeInput({ value, onChange, onComplete }: CodeInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  const handleInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, '').toUpperCase()
    
    if (input.length > 1) {
      const newCode = value.split('')
      const chars = input.split('')
      chars.forEach((char, i) => {
        if (index + i < 6 && char) {
          newCode[index + i] = char
        }
      })
      const newValue = newCode.join('').substring(0, 6)
      onChange(newValue)
      
      if (newValue.length === 6) {
        setTimeout(() => onComplete(newValue), 200)
      }
      
      if (newValue.length <= 6) {
        const nextIndex = Math.min(index + chars.length, 5)
        inputsRef.current[nextIndex]?.focus()
      }
    } else if (input) {
      const newCode = value.split('')
      newCode[index] = input
      const newValue = newCode.join('')
      onChange(newValue)
      
      if (newValue.length === 6) {
        setTimeout(() => onComplete(newValue), 200)
      } else if (index < 5) {
        inputsRef.current[index + 1]?.focus()
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!value[index] && index > 0) {
        const newCode = value.split('')
        newCode[index - 1] = ''
        onChange(newCode.join(''))
        inputsRef.current[index - 1]?.focus()
      } else {
        const newCode = value.split('')
        newCode[index] = ''
        onChange(newCode.join(''))
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  useEffect(() => {
    if (value.length === 0) {
      inputsRef.current[0]?.focus()
    }
  }, [])

  return (
    <div className="code-input-container">
      <Row gutter={12} justify="center">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Col key={index}>
            <input
              ref={(el) => { inputsRef.current[index] = el }}
              type="text"
              maxLength={2}
              value={value[index] || ''}
              onChange={(e) => handleInputChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="code-input"
              inputMode="numeric"
              autoComplete="off"
            />
          </Col>
        ))}
      </Row>
    </div>
  )
}

export default function ActivatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  
  const searchParams = new URLSearchParams(location.search)
  const prefilledEmail = searchParams.get('email')
  
  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail)
    }
  }, [prefilledEmail])

  const validateEmail = useCallback((emailValue: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailValue) {
      setEmailError('请输入邮箱地址')
      return false
    }
    if (!emailRegex.test(emailValue)) {
      setEmailError('请输入有效的邮箱地址')
      return false
    }
    setEmailError('')
    return true
  }, [])

  const handleSubmit = useCallback(async (codeOverride?: string) => {
    const finalCode = codeOverride || code
    if (!validateEmail(email)) return
    if (finalCode.length !== 6) return
    
    setLoading(true)
    try {
      await axios.post('/api/email/activate', {
        email,
        code: finalCode.toUpperCase()
      })
      message.success('邮箱验证成功，账号已激活')
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (err: any) {
      message.error(err?.response?.data?.error || '激活失败，请重试')
      setCode('')
    } finally {
      setLoading(false)
    }
  }, [email, code, navigate, validateEmail])

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (emailError) {
      validateEmail(e.target.value)
    }
  }

  const handleSendAgain = async () => {
    if (!validateEmail(email)) return
    
    setLoading(true)
    try {
      await axios.post('/api/email/resend-activation', { email }, {
        headers: {
          'Content-Type': 'application/json'
        }
      })
      message.success('激活验证码已重新发送')
      setCode('')
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    }}>
      <Card
        className="glass-off"
        style={{ 
          width: 480, 
          maxWidth: '100%',
          borderRadius: '20px',
          background: '#ffffff',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
          border: 'none',
          overflow: 'hidden'
        }}
      >
        <div style={{ 
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          padding: '32px',
          margin: '-24px -24px 24px -24px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              width: '80px', 
              height: '80px', 
              margin: '0 auto 16px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg 
                width="40" 
                height="40" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </div>
            <Title level={2} style={{ 
              color: 'white', 
              marginBottom: '8px',
              fontWeight: 600
            }}>账号激活</Title>
            <p style={{ 
              color: 'rgba(255, 255, 255, 0.85)', 
              fontSize: '14px',
              margin: 0
            }}>
              请输入邮箱收到的激活验证码
            </p>
          </div>
        </div>
        
        <div style={{ padding: '0 24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#333'
            }}>
              邮箱地址
            </label>
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="请输入您的邮箱地址"
              disabled={!!prefilledEmail}
              style={{
                width: '100%',
                height: '48px',
                padding: '0 16px',
                fontSize: '15px',
                border: '2px solid #e8e8e8',
                borderRadius: '12px',
                outline: 'none',
                transition: 'all 0.3s',
                backgroundColor: prefilledEmail ? '#f8f9fa' : 'white'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#6366f1'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e8e8e8'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            {emailError && (
              <p style={{ 
                color: '#ff4d4f', 
                fontSize: '12px', 
                marginTop: '6px',
                marginBottom: 0
              }}>
                {emailError}
              </p>
            )}
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <label style={{ 
                fontSize: '14px',
                fontWeight: 500,
                color: '#333'
              }}>
                激活验证码
              </label>
              <Button
                type="link"
                onClick={handleSendAgain}
                loading={loading}
                style={{ 
                  padding: 0,
                  color: '#6366f1',
                  fontWeight: 500
                }}
              >
                重新发送
              </Button>
            </div>
            
            <CodeInput 
              value={code} 
              onChange={setCode}
              onComplete={handleSubmit}
            />
            
            <p style={{ 
              textAlign: 'center',
              color: '#888',
              fontSize: '13px',
              marginTop: '12px',
              marginBottom: 0
            }}>
              验证码有效期30分钟，输入完成后自动提交
            </p>
          </div>
          
          <Button
            type="primary"
            onClick={() => { void handleSubmit() }}
            loading={loading}
            disabled={code.length !== 6 || !email || !!emailError}
            style={{ 
              width: '100%', 
              height: '50px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
            }}
          >
            完成激活
          </Button>
          
          <div style={{ 
            textAlign: 'center', 
            marginTop: '16px' 
          }}>
            <Button 
              type="link" 
              onClick={() => navigate('/login')}
              style={{ 
                padding: 0,
                color: '#666',
                fontWeight: 500
              }}
            >
              返回登录
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}