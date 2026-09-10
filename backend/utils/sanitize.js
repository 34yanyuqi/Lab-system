/**
 * 输入校验与 HTML 清洗工具。
 * 学生提交内容、审核评语、任务正文都会在前端以 HTML 形式渲染，
 * 因此必须在写入数据库前移除脚本、事件属性等危险内容（存储型 XSS 防护）。
 */

const DANGEROUS_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'meta', 'link', 'base', 'form', 'input', 'button', 'svg', 'math'
]

const DANGEROUS_ATTR_PREFIXES = ['on']
const DANGEROUS_URL_SCHEMES = /^\s*(javascript|vbscript|data):/i

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 清洗富文本 HTML：移除危险标签、事件属性、危险 URL 协议。
 * 这是正则层面的兜底清洗，前端另有 DOMParser 白名单清洗。
 */
function sanitizeHtml(value, options = {}) {
  const maxLength = options.maxLength || 200000
  if (value === undefined || value === null) return ''
  let html = String(value)
  if (html.length > maxLength) html = html.slice(0, maxLength)

  // 去掉 HTML 注释（可用于绕过过滤）
  html = html.replace(/<!--[\s\S]*?-->/g, '')

  // 去掉危险标签及其内容
  for (const tag of DANGEROUS_TAGS) {
    html = html.replace(new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, 'gi'), '')
    html = html.replace(new RegExp(`<\\s*\\/?\\s*${tag}\\b[^>]*>`, 'gi'), '')
  }

  // 去掉 on* 事件属性与危险协议
  html = html.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/(href|src|xlink:href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, attr, _quoted, dq, sq) => {
    const url = dq !== undefined ? dq : sq
    if (DANGEROUS_URL_SCHEMES.test(url || '')) return `${attr}="#"`
    return match
  })

  return html.trim()
}

/** 去除所有 HTML 标签，得到纯文本 */
function stripHtml(value) {
  if (value === undefined || value === null) return ''
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/**
 * 把富文本转成单行纯文本摘要，供通知正文、列表等按纯文本展示的场景使用。
 * 与 sanitizeHtml 的区别：sanitizeHtml 保留安全标签（给 dangerouslySetInnerHTML 用），
 * 本函数会去掉所有标签、把空白折叠成单空格，并去掉全角冒号后的空格
 * （富文本里评语常以 &nbsp; 开头，会留下「评语： xxx」这种多余空格）。
 */
function summarizeHtml(value, maxLength = 100) {
  const plain = stripHtml(value).replace(/\s+/g, ' ').replace(/：\s+/g, '：').trim()
  if (!plain) return ''
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain
}

function isNonEmptyString(value, maxLength = 255) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/** 校验 YYYY-MM-DD，并确认是真实存在的日期 */
function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

function isValidMonthString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12
}

function toPositiveInt(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return null
  const ids = []
  for (const item of value) {
    const id = toPositiveInt(item)
    if (id === null) return null
    if (!ids.includes(id)) ids.push(id)
  }
  return ids
}

module.exports = {
  sanitizeHtml,
  stripHtml,
  summarizeHtml,
  escapeHtml,
  isNonEmptyString,
  isValidEmail,
  isValidDateString,
  isValidMonthString,
  toPositiveInt,
  normalizeIdArray
}
