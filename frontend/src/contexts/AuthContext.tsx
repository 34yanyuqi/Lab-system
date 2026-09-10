import React, { createContext, useCallback, useEffect, useState } from 'react'
import api from '@/api'
import type { User } from '@/types'

interface AuthContextValue {
  token: string
  user: User | null
  isAuthenticated: boolean
  login: (credentials: Record<string, string>) => Promise<void>
  pinLogin: (pin: string) => Promise<void>
  register: (payload: Record<string, string>) => Promise<void>
  fetchProfile: () => Promise<User>
  updateProfile: (payload: Record<string, unknown>) => Promise<User>
  logout: () => void
  setUser: (nextUser: User | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export default AuthContext

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem('token') || '')
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const isAuthenticated = !!token

  const login = useCallback(async (credentials: Record<string, string>) => {
    const response = await api.post('/auth/login', credentials)
    const { token: newToken, user: newUser } = response.data
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }, [])

  const pinLogin = useCallback(async (pin: string) => {
    const response = await api.post('/auth/pin-login', { pin })
    const { token: newToken, user: newUser } = response.data
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }, [])

  const register = useCallback(async (payload: Record<string, string>) => {
    const response = await api.post('/auth/register', payload)
    const { token: newToken, user: newUser } = response.data
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }, [])

  const fetchProfile = useCallback(async () => {
    const response = await api.get('/auth/profile')
    setUser(response.data)
    localStorage.setItem('user', JSON.stringify(response.data))
    return response.data
  }, [])

  const updateProfile = useCallback(async (payload: Record<string, unknown>) => {
    const response = await api.put('/auth/profile', payload)
    setUser(response.data)
    localStorage.setItem('user', JSON.stringify(response.data))
    return response.data
  }, [])

  const logout = useCallback(() => {
    setToken('')
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, login, pinLogin, register, fetchProfile, updateProfile, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
