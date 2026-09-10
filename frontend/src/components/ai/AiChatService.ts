/**
 * AI 聊天服务层（前端纯逻辑）
 * 委托实际 API 调用给 @/api/ai 模块
 */
import {
  sendChatMessageStream as apiSendStream,
  loadChatHistory as apiLoadHistory,
  saveChatHistory as apiSaveHistory
} from '@/api/ai'
import type { AiChatMessage } from '@/types'

export async function sendChatMessageStream(
  submissionId: number,
  messages: { role: string; content: string }[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return apiSendStream(submissionId, messages, onToken, onDone, onError, signal)
}

export async function loadChatHistory(submissionId: number): Promise<AiChatMessage[]> {
  return apiLoadHistory(submissionId)
}

export async function saveChatHistory(submissionId: number, messages: AiChatMessage[]): Promise<void> {
  return apiSaveHistory(submissionId, messages)
}
