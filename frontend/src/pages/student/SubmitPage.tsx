import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, Form, Button, Space, Modal, Alert, Empty, message, Tag, Descriptions } from 'antd'
import { UploadOutlined, FolderOpenOutlined, ExclamationCircleOutlined, ClockCircleOutlined, EyeOutlined, DownloadOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons'
import api from '@/api'
import type { TaskItem, SubmissionItem } from '@/types'
import { getTagColor, getTypeLabel, getReviewTagColor, reviewStatusLabels } from '@/config'
import { formatRichTextForDisplay, getDeadlineTime, getRemainingDays, formatDateTime } from '@/utils/format'
import { getSubmissionFileMeta, isPdfFile, renderFileTypeIcon } from '@/utils/file'
import RichTextEditor from '@/components/common/RichTextEditor'

export default function StudentSubmitPage() {
  const navigate = useNavigate()
  const { taskId } = useParams()
  const [searchParams] = useSearchParams()
  const weekNumber = parseInt(searchParams.get('week') || '1')
  const [task, setTask] = useState<TaskItem | null>(null)
  const [existingSubmission, setExistingSubmission] = useState<SubmissionItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitContent, setSubmitContent] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [removeExistingFile, setRemoveExistingFile] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>('')
  const [pdfFullscreen, setPdfFullscreen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!taskId) return
    api.get(`/tasks/${taskId}`).then(response => setTask(response.data))
    api.get(`/submissions/task/${taskId}`).then(response => {
      if (response.data?.length > 0) {
        const current = response.data.find((s: SubmissionItem) => (s.week_number || 1) === weekNumber)
        if (current) {
          setExistingSubmission(current)
          setSubmitContent(current.submit_content || '')
        }
        setSelectedFile(null)
        setRemoveExistingFile(false)
      }
    })
  }, [taskId, weekNumber])

  const isDeadlinePassed = task ? Date.now() > getDeadlineTime(task.end_date) : false
  const isRejected = existingSubmission?.check_status === 'rejected'
  const canSubmit = !isDeadlinePassed || Boolean(existingSubmission)
  const isDeadlineNear = task ? !isDeadlinePassed && getRemainingDays(task.end_date) <= 3 && getRemainingDays(task.end_date) > 0 : false
  const existingFileMeta = getSubmissionFileMeta(existingSubmission)
  const keepingExistingFile = Boolean(existingFileMeta) && !removeExistingFile && !selectedFile

  const handleDownloadFile = (url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.target = '_blank'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openPdfPreview = (url: string) => {
    setPdfPreviewUrl(url)
  }

  const handleUploadImage = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('content_image', file)
      const response = await api.post('/submissions/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      return response.data
    } catch (error: any) {
      console.error('图片上传失败:', error)
      message.error(`图片上传失败: ${error.response?.data?.error || error.message}`)
      throw error
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      message.error('任务已截止，当前不能提交')
      return
    }
    if (!submitContent && !selectedFile && !keepingExistingFile) {
      message.warning('请输入提交内容或上传附件')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('task_id', String(taskId || ''))
      formData.append('submit_content', submitContent || '')
      formData.append('keep_existing_file', keepingExistingFile ? 'true' : 'false')
      formData.append('week_number', String(weekNumber))
      if (selectedFile) {
        formData.append('submit_file', selectedFile)
      }

      await api.post('/submissions', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      message.success(existingSubmission ? '提交更新成功' : '提交成功')
      navigate('/student/dashboard')
    } catch (error: any) {
      console.error('提交失败:', error)
      const errorMsg = error.response?.data?.error || error.message || '提交失败，请稍后重试'
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  if (!task) {
    return <div className="page-shell"><Empty description="任务不存在" /></div>
  }

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="task-info-header">
          <h2>{task.title} - 第{weekNumber}周提交</h2>
          <span style={{ backgroundColor: getTagColor(task.type), padding: '2px 8px', borderRadius: 4, color: '#fff', fontSize: 12 }}>
            {getTypeLabel(task.type)}
          </span>
        </div>
        <div className="task-info-meta">
          <span>截止日期: {task.end_date}</span>
          <span>检查频次: {task.check_frequency}天</span>
        </div>
        {(task.doc_file_url || task.doc_url) && (
          <div className="task-attachment-panel">
            <h4>任务附件</h4>
            <div className="detail-box">
              {task.doc_file_url ? (
                <a href={task.doc_file_url} target="_blank" rel="noreferrer">
                  {task.doc_name || task.doc_file_url.split('/').pop() || '任务附件'}
                </a>
              ) : (
                <a href={task.doc_url} target="_blank" rel="noreferrer">
                  {task.doc_name || task.doc_url?.split('/').pop() || '任务附件'}
                </a>
              )}
            </div>
          </div>
        )}
        <div className="task-info-content">
          <h4>任务内容</h4>
          <div
            className="task-rich-content"
            dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(task.content) }}
          />
        </div>
        {isDeadlineNear && <Alert type="warning" showIcon message="任务即将截止，请尽快提交！" className="section-gap" />}
        {isDeadlinePassed && !existingSubmission && (
          <Alert
            type="error"
            showIcon
            message="任务已截止，无法提交！"
            className="section-gap"
          />
        )}
        {isDeadlinePassed && existingSubmission && !isRejected && (
          <Alert
            type="warning"
            showIcon
            message="任务已截止，您可以修改已提交的内容"
            className="section-gap"
          />
        )}
        {isRejected && (
          <Alert
            type="error"
            showIcon
            message="提交已被驳回，请根据导师评语修改后重新提交"
            className="section-gap"
          />
        )}
      </Card>

      {existingSubmission && (
        <Card className="compact-card section-gap" title="提交记录与审核状态">
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="提交时间">{formatDateTime(existingSubmission.submit_time)}</Descriptions.Item>
            <Descriptions.Item label="审核状态">
              <Tag color={getReviewTagColor(existingSubmission.check_status)}>{reviewStatusLabels[existingSubmission.check_status]}</Tag>
            </Descriptions.Item>
          </Descriptions>
          {existingSubmission.check_remark ? (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-soft)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--primary-color)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExclamationCircleOutlined /> <strong>导师评语</strong>{existingSubmission.check_time ? `（${formatDateTime(existingSubmission.check_time)}）` : ''}
              </div>
              <div dangerouslySetInnerHTML={{ __html: formatRichTextForDisplay(existingSubmission.check_remark) }} />
            </div>
          ) : (
            <div style={{ marginTop: 16, color: 'var(--text-tertiary)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ClockCircleOutlined /> 等待导师审核...
            </div>
          )}
        </Card>
      )}

      <Card className="compact-card section-gap" title="提交任务">
        <Form layout="vertical">
          <Form.Item label="提交内容">
            <RichTextEditor value={submitContent} onChange={setSubmitContent} placeholder="请输入提交内容" onUploadImage={handleUploadImage} />
          </Form.Item>
          <Form.Item label="附件上传">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Button icon={<UploadOutlined />} type="primary" onClick={() => fileRef.current?.click()}>
                  {existingFileMeta ? '替换附件' : '选择文件'}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.zip,.rar,.7z"
                  style={{ display: 'none' }}
                  onChange={event => {
                    const file = event.target.files?.[0]
                    setSelectedFile(file || null)
                    setRemoveExistingFile(false)
                    event.target.value = ''
                  }}
                />
                <span className="muted-meta">支持 pdf/zip/rar/7z，限1个文件，不超过100MB</span>
              </Space>
              {selectedFile && (
                <div className="file-info">
                  <FolderOpenOutlined />
                  <span>{selectedFile.name}</span>
                  <Button type="link" size="small" onClick={() => setSelectedFile(null)}>取消替换</Button>
                </div>
              )}
              {!selectedFile && existingFileMeta && !removeExistingFile && (
                <div className="file-info">
                  {renderFileTypeIcon(existingFileMeta.name)}
                  <a href={existingFileMeta.url} target="_blank" rel="noreferrer">{existingFileMeta.name}</a>
                  {isPdfFile(existingFileMeta.url) && (
                    <Space>
                      <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openPdfPreview(existingFileMeta.url)}>预览</Button>
                      <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(existingFileMeta.url, existingFileMeta.name)}>下载</Button>
                    </Space>
                  )}
                  <Button type="link" danger size="small" onClick={() => {
                    Modal.confirm({
                      title: '确认移除',
                      content: '确定要移除该附件吗？提交后生效。',
                      okText: '确定移除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => setRemoveExistingFile(true)
                    })
                  }}>移除附件</Button>
                </div>
              )}
              {!selectedFile && existingFileMeta && removeExistingFile && (
                <div className="file-info">
                  <FolderOpenOutlined />
                  <span>已移除原附件，提交后生效</span>
                  <Button type="link" size="small" onClick={() => setRemoveExistingFile(false)}>撤销移除</Button>
                </div>
              )}
            </Space>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" loading={loading} disabled={!canSubmit} onClick={handleSubmit}>
                提交
              </Button>
              <Button onClick={() => navigate('/student/dashboard')}>返回</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Modal
        open={!!pdfPreviewUrl}
        title="PDF预览"
        width={900}
        footer={null}
        onCancel={() => { setPdfPreviewUrl(''); setPdfFullscreen(false); }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: 6 }}>
            <span style={{ fontWeight: 500 }}>{renderFileTypeIcon(pdfPreviewUrl)} {pdfPreviewUrl.split('/').pop()}</span>
            <div style={{ flex: 1 }} />
            <Button size="small" icon={<FullscreenOutlined />} onClick={() => setPdfFullscreen(true)}>全屏查看</Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadFile(pdfPreviewUrl, pdfPreviewUrl.split('/').pop() || 'file.pdf')}>下载</Button>
          </div>
          <iframe
            src={pdfPreviewUrl}
            style={{ width: '100%', height: 600, border: '1px solid var(--border-color)', borderRadius: 6 }}
            title="PDF预览"
          />
        </div>
      </Modal>

      {pdfFullscreen && pdfPreviewUrl && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'var(--bg-page)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 24px',
            background: 'var(--bg-soft)',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <span style={{ fontWeight: 500, fontSize: 16 }}>{renderFileTypeIcon(pdfPreviewUrl)} {pdfPreviewUrl.split('/').pop()}</span>
            <div style={{ flex: 1 }} />
            <Button icon={<DownloadOutlined />} onClick={() => handleDownloadFile(pdfPreviewUrl, pdfPreviewUrl.split('/').pop() || 'file.pdf')}>下载</Button>
            <Button icon={<FullscreenExitOutlined />} onClick={() => setPdfFullscreen(false)}>退出全屏</Button>
          </div>
          <iframe
            src={pdfPreviewUrl}
            style={{ flex: 1, border: 'none' }}
            title="PDF全屏查看"
          />
        </div>
      )}

    </div>
  )
}