import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'antd/dist/reset.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/pages-check.css'
import './styles/pages-login.css'
import './styles/pages-register.css'
import './styles/pages-activate.css'
import './styles/pages-dashboard.css'
import './styles/glass.css'
import App from './App'
import { AuthProvider, MajorListContext, NotificationProvider } from '@/contexts'
import ErrorBoundary from '@/components/common/ErrorBoundary'

const MAJOR_LIST = [
  '计算机科学与技术',
  '计算机应用',
  '软件工程',
  '人工智能',
  '信息安全',
  '网络工程',
  '数据科学',
  '物联网工程',
  '数字媒体技术'
]

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <NotificationProvider>
            <MajorListContext.Provider value={MAJOR_LIST}>
              <App />
            </MajorListContext.Provider>
          </NotificationProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
)
