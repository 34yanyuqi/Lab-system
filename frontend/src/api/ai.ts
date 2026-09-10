/**
 * AI 模块 API
 * - 单提交对话（SSE 流式）
 * - 对话历史管理
 * - 学生周次提交列表
 * - 多周进度分析（SSE 流式）
 * - 分析历史管理
 */
import api from './axios'
import type { AiChatMessage, StudentWeekSubmission, AiAnalysisRecord } from '@/types'

// ==================== 单提交对话 ====================

export async function sendChatMessageStream(
  submissionId: number,
  messages: { role: string; content: string }[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('token')

  let response: Response
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ submissionId, messages }),
      signal
    })
  } catch (err) {
    // 网络异常时 fetch 会直接 reject，必须回调 onError，否则调用方会永久停留在加载态
    if ((err as Error)?.name === 'AbortError') return
    onError('网络异常，无法连接 AI 服务')
    return
  }

  if (!response.ok) {
    let errorMsg = '请求失败'
    try {
      const errData = await response.json()
      errorMsg = errData.error || errorMsg
    } catch { /* ignore */ }
    onError(errorMsg)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError('浏览器不支持流式读取')
    return
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6)

          if (data === '[DONE]') {
            onDone()
            return
          }

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              onError(parsed.error)
              return
            }
            if (parsed.token) {
              onToken(parsed.token)
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }

    onDone()
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('流式读取失败:', err)
      onError('连接中断或读取失败')
    }
  }
}

// ==================== 对话历史 ====================

export async function loadChatHistory(submissionId: number): Promise<AiChatMessage[]> {
  try {
    const res = await api.get<{ success: boolean; data: { messages: AiChatMessage[] } }>(
      `/ai/history/${submissionId}`
    )
    return res.data.data.messages || []
  } catch {
    return []
  }
}

export async function saveChatHistory(submissionId: number, messages: AiChatMessage[]): Promise<void> {
  try {
    const payload = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      studentId: m.studentId
    }))
    await api.post(`/ai/history/${submissionId}`, { messages: payload })
  } catch (err) {
    console.error('保存对话历史失败:', err)
  }
}

// ==================== 学生周次提交列表 ====================

export async function fetchStudentWeekSubmissions(studentId: number): Promise<StudentWeekSubmission[]> {
  try {
    const res = await api.get<{ success: boolean; data: StudentWeekSubmission[] }>(
      `/ai/student/${studentId}/submissions`
    )
    return res.data.data || []
  } catch (err) {
    console.error('获取学生提交列表失败:', err)
    return []
  }
}

// ==================== 多周进度分析 ====================

export async function analyzeProgressStream(
  studentId: number,
  submissionIds: number[],
  taskId: number,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = localStorage.getItem('token')

  let response: Response
  try {
    response = await fetch('/api/ai/analyze-progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ studentId, submissionIds, taskId }),
      signal
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    onError('网络异常，无法连接 AI 服务')
    return
  }

  if (!response.ok) {
    let errorMsg = '请求失败'
    try {
      const errData = await response.json()
      errorMsg = errData.error || errorMsg
    } catch { /* ignore */ }
    onError(errorMsg)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError('浏览器不支持流式读取')
    return
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine) continue

        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6)

          if (data === '[DONE]') {
            onDone()
            return
          }

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              onError(parsed.error)
              return
            }
            if (parsed.token) {
              onToken(parsed.token)
            }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }

    onDone()
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('流式读取失败:', err)
      onError('连接中断或读取失败')
    }
  }
}

// ==================== 分析历史 ====================

export async function loadAnalysisHistory(): Promise<AiAnalysisRecord[]> {
  try {
    const res = await api.get<{ success: boolean; data: AiAnalysisRecord[] }>('/ai/analysis-history')
    return res.data.data || []
  } catch (err) {
    console.error('加载分析历史失败:', err)
    return []
  }
}

export async function getAnalysisDetail(id: number): Promise<AiAnalysisRecord | null> {
  try {
    const res = await api.get<{ success: boolean; data: AiAnalysisRecord }>(`/ai/analysis-history/${id}`)
    return res.data.data || null
  } catch (err) {
    console.error('加载分析详情失败:', err)
    return null
  }
}
