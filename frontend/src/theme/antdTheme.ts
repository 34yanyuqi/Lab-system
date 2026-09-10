import type { ThemeConfig } from 'antd'
import { theme } from 'antd'
import type { ThemeMode } from '@/types'

const { darkAlgorithm, defaultAlgorithm } = theme

/**
 * antd 主题令牌。
 * 这里的取值必须与 src/styles/global.css 中的 CSS 变量保持一致，
 * 否则会出现「卡片是暗色、输入框是浅色」这类割裂感。
 */
const DARK_TOKENS: ThemeConfig['token'] = {
  colorPrimary: '#00d4ff',
  colorInfo: '#00d4ff',
  // 亮青色按钮上用深色文字，避免白字对比度不足
  colorTextLightSolid: '#04141c',
  colorLink: '#4fdcff',
  colorLinkHover: '#7ae6ff',
  colorBgBase: '#0b1017',
  colorBgLayout: '#0b1017',
  colorBgContainer: '#131a23',
  colorBgElevated: '#1a2330',
  colorBgSpotlight: '#1a2330',
  colorBorder: 'rgba(148, 163, 184, 0.24)',
  colorBorderSecondary: 'rgba(148, 163, 184, 0.14)',
  colorText: '#e9eef6',
  colorTextSecondary: '#a7b4c6',
  colorTextTertiary: '#7f8da1',
  colorTextQuaternary: '#64748b',
  colorFillSecondary: 'rgba(148, 163, 184, 0.14)',
  colorFillTertiary: 'rgba(148, 163, 184, 0.09)',
  colorFillQuaternary: 'rgba(148, 163, 184, 0.05)',
  colorSuccess: '#4ade80',
  colorWarning: '#fbbf24',
  colorError: '#ff7875',
}

const LIGHT_TOKENS: ThemeConfig['token'] = {
  colorPrimary: '#2563eb',
  colorInfo: '#2563eb',
  colorLink: '#2563eb',
  colorLinkHover: '#1d4ed8',
  colorBgBase: '#ffffff',
  colorBgLayout: '#f4f6fa',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBorder: '#dbe2ec',
  colorBorderSecondary: '#e4e9f2',
  colorText: '#1f2937',
  colorTextSecondary: '#556074',
  colorTextTertiary: '#5f6b7f',
  colorTextQuaternary: '#98a2b3',
  colorFillSecondary: 'rgba(15, 23, 42, 0.06)',
  colorFillTertiary: 'rgba(15, 23, 42, 0.04)',
  colorFillQuaternary: 'rgba(15, 23, 42, 0.02)',
  colorSuccess: '#067647',
  colorWarning: '#b45309',
  colorError: '#d92d20',
}

const SHARED_TOKENS: ThemeConfig['token'] = {
  borderRadius: 10,
  borderRadiusLG: 14,
  borderRadiusSM: 6,
  controlHeight: 38,
  fontSize: 14,
  wireframe: false,
}

const COMPONENT_TOKENS: ThemeConfig['components'] = {
  Layout: {
    headerBg: 'transparent',
    siderBg: 'transparent',
    bodyBg: 'transparent',
  },
  Menu: {
    itemBorderRadius: 10,
    itemHeight: 46,
  },
  Table: {
    headerBorderRadius: 12,
  },
  Card: {
    borderRadiusLG: 14,
  },
}

export function buildAntdTheme(mode: ThemeMode): ThemeConfig {
  return {
    algorithm: mode === 'dark' ? darkAlgorithm : defaultAlgorithm,
    token: {
      ...SHARED_TOKENS,
      ...(mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS),
    },
    components: COMPONENT_TOKENS,
  }
}
