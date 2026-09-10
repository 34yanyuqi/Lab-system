import { useCallback, useEffect, useRef } from 'react'

/**
 * 请求竞态守卫：多次并发请求时，只允许最新一次的结果写入状态。
 *
 * 用法：
 *   const guard = useRequestGuard()
 *   const load = useCallback(async () => {
 *     const isLatest = guard()
 *     const res = await api.get(...)
 *     if (!isLatest()) return
 *     setData(res.data)
 *   }, [guard])
 *
 * 每个相互独立的请求应各自调用一次 useRequestGuard()。
 */
export function useRequestGuard() {
  const seqRef = useRef(0)

  useEffect(() => {
    return () => {
      // 组件卸载后让所有在途请求的结果失效
      seqRef.current++
    }
  }, [])

  return useCallback(() => {
    const seq = ++seqRef.current
    return () => seq === seqRef.current
  }, [])
}

export default useRequestGuard
