import React from 'react'
import mammoth from 'mammoth'
import {
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FileUnknownOutlined,
  PictureOutlined,
  LinkOutlined,
  PaperClipOutlined
} from '@ant-design/icons'
import type { SubmissionItem, TaskItem } from '@/types'

export function getFileExtension(fileName: string): string {
  if (!fileName) return 'unknown'
  const idx = fileName.lastIndexOf('.')
  if (idx === -1) return 'unknown'
  return fileName.slice(idx + 1).toLowerCase()
}

export function renderFileTypeIcon(fileName: string): React.ReactNode {
  if (!fileName) return <FileUnknownOutlined />
  const ext = getFileExtension(fileName)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return <PictureOutlined />
  if (['pdf'].includes(ext)) return <FilePdfOutlined style={{ color: '#e74c3c' }} />
  if (['doc', 'docx'].includes(ext)) return <FileWordOutlined style={{ color: '#2b579a' }} />
  if (['ppt', 'pptx'].includes(ext)) return <FileTextOutlined style={{ color: '#d24726' }} />
  if (['xls', 'xlsx'].includes(ext)) return <FileExcelOutlined style={{ color: '#217346' }} />
  if (['txt'].includes(ext)) return <FileTextOutlined />
  if (['zip', 'rar', '7z'].includes(ext)) return <FileZipOutlined />
  return <FileUnknownOutlined />
}

export function getSubmissionFileMeta(submission?: Pick<SubmissionItem, 'submit_file' | 'submit_file_name' | 'submit_file_url'> | null) {
  if (!submission) return null
  const name = submission.submit_file_name || submission.submit_file || ''
  const url = submission.submit_file_url || `/uploads/submissions/${submission.submit_file}`
  if (!name || (!submission.submit_file_url && !submission.submit_file)) return null
  return { name, url, type: getFileExtension(name) }
}

export function renderAttachmentLink(submission?: Pick<SubmissionItem, 'submit_file' | 'submit_file_name' | 'submit_file_url'> | null): React.ReactNode {
  const meta = getSubmissionFileMeta(submission)
  if (!meta) return <span style={{ color: 'var(--text-tertiary)' }}>暂无附件</span>
  return (
    <a href={meta.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {renderFileTypeIcon(meta.name)}
      <span>{meta.name}</span>
      <LinkOutlined style={{ fontSize: 12 }} />
    </a>
  )
}

export function getTaskDocumentMeta(task?: Pick<TaskItem, 'doc_url' | 'doc_name' | 'doc_file_url' | 'doc_kind'> | null) {
  if (!task) return null
  // 后端对 link 也会填充 doc_file_url/doc_name，必须先用 doc_kind 区分类型
  if (task.doc_kind === 'file' && task.doc_file_url && task.doc_name) {
    return { kind: 'file' as const, name: task.doc_name, url: task.doc_file_url, type: getFileExtension(task.doc_name) }
  }
  if (task.doc_url) {
    let name = task.doc_name || task.doc_url
    try {
      const u = new URL(task.doc_url)
      const pathParts = u.pathname.split('/')
      name = decodeURIComponent(pathParts[pathParts.length - 1]) || u.hostname
    } catch { /* keep raw name */ }
    return { kind: 'link' as const, name, url: task.doc_url }
  }
  return null
}

export function renderTaskDocumentLink(task?: Pick<TaskItem, 'doc_url' | 'doc_name' | 'doc_file_url' | 'doc_kind'> | null): React.ReactNode {
  const meta = getTaskDocumentMeta(task)
  if (!meta) return <span style={{ color: 'var(--text-tertiary)' }}>暂无附件</span>
  return (
    <a href={meta.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {meta.kind === 'file' ? renderFileTypeIcon(meta.name) : <PaperClipOutlined />}
      <span>{meta.name}</span>
      <LinkOutlined style={{ fontSize: 12 }} />
    </a>
  )
}

export function isImageFile(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url)
}

export function isPdfFile(url: string): boolean {
  return /\.pdf$/i.test(url)
}

export function isDocxFile(url: string): boolean {
  return /\.docx?$/i.test(url)
}

export function isPptxFile(url: string): boolean {
  return /\.pptx?$/i.test(url)
}

export function isXlsxFile(url: string): boolean {
  return /\.xlsx?$/i.test(url)
}

export function isOfficeFile(url: string): boolean {
  return /\.(docx?|pptx?|xlsx?)$/i.test(url)
}

export function isPreviewableFile(url: string): boolean {
  if (!url) return false
  return /\.(png|jpe?g|gif|webp|bmp|svg|pdf|docx?|pptx?|xlsx?)$/i.test(url)
}

export async function convertDocxToHtml(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('文件加载失败')
  const arrayBuffer = await response.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  return result.value
}
