import { useState, useEffect, useCallback, useMemo } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ThemeContext } from '@/contexts'
import type { ThemeMode } from '@/types'
import { buildAntdTheme } from '@/theme/antdTheme'
import Router from '@/router'

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    // index.html 里的内联脚本已根据系统偏好写入 data-theme，这里直接复用，避免二次闪烁
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    localStorage.setItem('theme', themeMode)
    document.documentElement.setAttribute('data-theme', themeMode)
    document
      .getElementById('theme-color-meta')
      ?.setAttribute('content', themeMode === 'light' ? '#f4f6fa' : '#0b1017')
  }, [themeMode])

  const handleSetTheme = useCallback((t: ThemeMode) => {
    setThemeMode(t)
  }, [])

  const antdTheme = useMemo(() => buildAntdTheme(themeMode), [themeMode])

  return (
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <ThemeContext.Provider value={{ theme: themeMode, setTheme: handleSetTheme }}>
        <Router />
      </ThemeContext.Provider>
    </ConfigProvider>
  )
}
