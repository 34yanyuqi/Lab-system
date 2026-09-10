/**
 * 轻量 Markdown → HTML 转换工具。
 *
 * AI 助手的回复以 Markdown 文本流式返回，气泡展示与「导入导师评价」
 * （写入审核评语）需要完全一致的渲染结果，因此抽取为公共工具，
 * 保证老师看到的 AI 内容与导入到评语中的内容一致。
 */

/** 将简单 Markdown 转换为 HTML 片段（标签均在 sanitizeHtml 白名单内） */
export function formatSimpleMarkdown(text: string): string {
  let html = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

  html = html.replace(/\n\n/g, '</p><p>')
  html = html.replace(/\n/g, '<br/>')
  html = '<p>' + html + '</p>'

  html = html.replace(/<p><h([234])>/g, '<h$1>')
  html = html.replace(/<\/h([234])><\/p>/g, '</h$1>')
  html = html.replace(/<p><pre>/g, '<pre>')
  html = html.replace(/<\/pre><\/p>/g, '</pre>')
  html = html.replace(/<p><ul>/g, '<ul>')
  html = html.replace(/<\/ul><\/p>/g, '</ul>')

  html = html.replace(/<pre><code>([\s\S]*)$/, (_, code) => {
    return '<pre><code>' + code + '</code></pre>'
  })

  return html
}
