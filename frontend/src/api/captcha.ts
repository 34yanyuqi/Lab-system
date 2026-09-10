import api from './axios'

export interface CaptchaResponse {
  captchaId: string
  captcha: string
}

export const captchaApi = {
  getCaptcha: () => api.get<CaptchaResponse>('/captcha'),
  verifyCaptcha: (captchaId: string, captchaText: string) =>
    api.post('/verify-captcha-noauth', { captchaId, captchaText })
}