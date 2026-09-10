import { useState, useEffect, useRef, useCallback } from 'react'
import { message } from 'antd'
import { PictureOutlined, BoldOutlined, ItalicOutlined, UnderlineOutlined, UnorderedListOutlined, OrderedListOutlined, LinkOutlined, StrikethroughOutlined } from '@ant-design/icons'
import { sanitizeHtml } from '@/utils/sanitizeHtml'

interface RichTextEditorProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  onUploadImage?: (file: File) => Promise<{ url: string; name?: string }>
  compact?: boolean
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  onUploadImage,
  compact
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    // 外部传入的富文本可能来自历史数据，渲染前必须清洗
    const nextValue = sanitizeHtml(value || '')
    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue
    }
  }, [value])

  const emitChange = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML || '')
  }, [onChange])

  const applyCommand = useCallback((command: string, commandValue?: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false, commandValue)
    emitChange()
  }, [emitChange])

  const insertLink = useCallback(() => {
    const url = window.prompt('请输入链接地址')
    if (!url) return
    applyCommand('createLink', url)
  }, [applyCommand])

  const handleSelectImage = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onUploadImage) {
      event.target.value = ''
      return
    }

    const validImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
    if (!validImageTypes.includes(file.type)) {
      message.error('只支持PNG、JPEG、WebP和GIF格式的图片')
      event.target.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      message.error('图片大小不能超过10MB')
      event.target.value = ''
      return
    }

    try {
      message.loading({ content: '正在上传图片...', key: 'uploading' })
      const uploaded = await onUploadImage(file)

      const editor = editorRef.current
      if (editor) {
        editor.focus()
        const img = document.createElement('img')
        img.src = uploaded.url
        img.alt = uploaded.name || '上传的图片'
        img.style.maxWidth = '100%'
        img.style.height = 'auto'

        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          range.deleteContents()
          range.insertNode(img)
        } else {
          editor.appendChild(img)
        }

        emitChange()
      }
      message.success({ content: '图片上传成功', key: 'uploading' })
    } catch (error) {
      console.error('图片上传失败:', error)
      message.error({ content: '图片上传失败，请重试', key: 'uploading' })
    } finally {
      event.target.value = ''
    }
  }, [applyCommand, onUploadImage, emitChange])

  const toolbarButtons = [
    { icon: <BoldOutlined />, title: '加粗', command: 'bold' },
    { icon: <ItalicOutlined />, title: '斜体', command: 'italic' },
    { icon: <UnderlineOutlined />, title: '下划线', command: 'underline' },
    { icon: <UnorderedListOutlined />, title: '无序列表', command: 'insertUnorderedList' },
    { icon: <OrderedListOutlined />, title: '有序列表', command: 'insertOrderedList' },
    { icon: <LinkOutlined />, title: '插入链接', command: 'insertLink', custom: insertLink },
    { icon: <PictureOutlined />, title: '插入图片', command: 'insertImage', custom: () => imageInputRef.current?.click() },
    { icon: <StrikethroughOutlined />, title: '清除格式', command: 'removeFormat' },
  ]

  return (
    <div className={`rich-editor${compact ? ' rich-editor-compact' : ''}`}>
      <div className="rich-editor-toolbar">
        {toolbarButtons.map(btn => (
          <button
            key={btn.command}
            type="button"
            title={btn.title}
            onClick={btn.custom || (() => applyCommand(btn.command))}
          >
            {btn.icon}
          </button>
        ))}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={handleSelectImage}
        />
      </div>
      <div
        ref={editorRef}
        className="rich-editor-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || ''}
        onInput={emitChange}
      />
    </div>
  )
}