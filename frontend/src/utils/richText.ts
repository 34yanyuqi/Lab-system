import { sanitizeHtml } from './sanitizeHtml'

export function hasHtmlMarkup(value?: string): boolean {
  if (!value) return false
  return /<[a-z][\s\S]*>/i.test(value)
}

/**
 * 将后端存储的富文本转换为可安全渲染的 HTML。
 * - 含 HTML 标签的内容走白名单清洗（防止存储型 XSS）
 * - 纯文本内容做转义并把换行转换为 <br/>
 */
export function formatRichTextForDisplay(value?: string): string {
  if (!value) return ''
  if (hasHtmlMarkup(value)) return sanitizeHtml(value)
  return sanitizeHtml(
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')
  )
}

/** 去除 HTML 标签与常见实体，得到纯文本（用于对比/预览） */
export function htmlToPlainText(value?: string): string {
  if (!value) return ''
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getTextPreview(value?: string, maxLen = 100): string {
  const stripped = htmlToPlainText(value)
  if (!stripped) return '无内容'
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '...' : stripped
}

export { sanitizeHtml }
