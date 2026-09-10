import api from './axios'
import type { User } from '@/types'

export interface LoginPayload {
  username: string
  password: string
  role?: 'teacher' | 'student'
  captchaId: string
  captchaText: string
}

export interface RegisterPayload {
  username: string
  password: string
  role: 'student'
  student_id: string
  student_grade: string
  student_major: string
  student_email: string
  graduate_year: string
  captchaId: string
  captchaText: string
}

export interface PinLoginPayload {
  pin: string
}

export const authApi = {
  login: (data: LoginPayload) => api.post<{ token: string; user: User }>('/auth/login', data),
  pinLogin: (data: PinLoginPayload) => api.post<{ token: string; user: User }>('/auth/pin-login', data),
  setPin: (data: { pin: string; emailCode: string }) => api.put<{ message: string }>('/auth/pin', data),
  register: (data: RegisterPayload) => api.post<{ token: string; user: User }>('/auth/register', data),
  getProfile: () => api.get<User & { hasPin?: boolean }>('/auth/profile'),
  updateProfile: (data: Record<string, unknown>) => api.put<User>('/auth/profile', data)
}