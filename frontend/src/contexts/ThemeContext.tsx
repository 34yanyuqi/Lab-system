import { createContext, useContext } from 'react'
import type { ThemeContextType } from '@/types'

export const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
