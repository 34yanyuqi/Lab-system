/**
 * 前端 HTML 清洗工具。
 *
 * 任务正文、学生提交内容、审核评语都会以 innerHTML 形式渲染，
 * 这些内容来自用户输入，必须清洗后再交给 dangerouslySetInnerHTML，
 * 否则存在存储型 XSS 风险（例如 <img src=x onerror=...>）。
 */

const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'meta', 'link', 'base', 'form', 'input', 'textarea', 'select',
  'option', 'button', 'svg', 'math', 'template', 'noscript', 'title'
])

const ALLOWED_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup',
  'p', 'br', 'hr', 'div', 'span', 'font', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'img', 'figure', 'figcaption'
])

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel',
  'width', 'height', 'colspan', 'rowspan', 'align', 'color', 'face', 'size'
])

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i
const SAFE_IMAGE = /^(https?:|\/|data:image\/(png|jpe?g|gif|webp|bmp);base64,)/i

function sanitizeStyleValue(value: string): string {
  return value
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/url\s*\(/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding/gi, '')
    .replace(/@import/gi, '')
}

function sanitizeElement(root: Element): void {
  const stack: Element[] = [root]

  while (stack.length > 0) {
    const parent = stack.pop() as Element

    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase()

      if (DROP_TAGS.has(tag)) {
        child.remove()
        continue
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // 未在白名单中的标签直接拆掉，保留其子节点继续处理
        const container = child.parentNode
        if (container) {
          while (child.firstChild) container.insertBefore(child.firstChild, child)
          child.remove()
          stack.push(parent)
        }
        continue
      }

      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()

        if (name.startsWith('on') || !ALLOWED_ATTRS.has(name)) {
          child.removeAttribute(attr.name)
          continue
        }

        if (name === 'href' && !SAFE_LINK.test(attr.value.trim())) {
          child.setAttribute('href', '#')
        }

        if (name === 'src' && !SAFE_IMAGE.test(attr.value.trim())) {
          child.removeAttribute('src')
        }

        if (name === 'style') {
          const cleaned = sanitizeStyleValue(attr.value)
          if (cleaned.trim()) child.setAttribute('style', cleaned)
          else child.removeAttribute('style')
        }
      }

      if (child.tagName.toLowerCase() === 'a' && child.getAttribute('target') === '_blank') {
        child.setAttribute('rel', 'noopener noreferrer')
      }

      stack.push(child)
    }
  }
}

/** 基于正则的兜底清洗，用于没有 DOMParser 的环境 */
function sanitizeByRegex(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|vbscript|data:(?!image\/)[^"']*)\s*\2/gi, '$1="#"')
}

export function sanitizeHtml(value?: string): string {
  if (!value) return ''
  const html = String(value)

  if (typeof DOMParser === 'undefined') {
    return sanitizeByRegex(html)
  }

  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstElementChild
    if (!root) return ''
    sanitizeElement(root)
    return root.innerHTML
  } catch {
    return sanitizeByRegex(html)
  }
}

export function escapeHtml(value?: string): string {
  if (!value) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
