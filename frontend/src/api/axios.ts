import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000
})

let interceptorsBound = false
if (!interceptorsBound) {
  api.interceptors.request.use(config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  api.interceptors.response.use(
    response => response,
    error => {
      if (error.response?.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // 登录/注册/激活页面本身会处理 401，不应强制跳转导致表单内容丢失
        const publicPaths = ['/login', '/register', '/activate']
        if (!publicPaths.includes(window.location.pathname)) {
          window.location.href = '/login'
        }
      }
      return Promise.reject(error)
    }
  )
  interceptorsBound = true
}

export default api