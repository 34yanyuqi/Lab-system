import { createContext, useContext } from 'react'

export const MajorListContext = createContext<string[]>([])

export function useMajorList() {
  return useContext(MajorListContext)
}
