import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Select, Row, Col, Space, Table, Tag, Modal, message, Upload, Empty, Descriptions, DatePicker } from 'antd'
import dayjs from 'dayjs'
import { PlusOutlined, DeleteOutlined, EyeOutlined, UploadOutlined, MinusCircleOutlined, FolderOpenOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '@/api'
import { formatDate, getDeadlineTime } from '@/utils/format'
import { getTypeLabel, getTagColor } from '@/config'
import { getTaskDocumentMeta, renderTaskDocumentLink } from '@/utils/file'
import { formatRichTextForDisplay, getTextPreview } from '@/utils/richText'
import type { TaskItem, StudentItem, SubmissionItem } from '@/types'

const { TextArea } = Input

export default function TeacherTasksPage() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [students, setStudents] = useState<StudentItem[]>([])
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false)
  const [submissionLoading, setSubmissionLoading] = useState(false)
  const [taskSubmissions, setTaskSubmissions] = useState<SubmissionItem[]>([])
  const [currentTaskTitle, setCurrentTaskTitle] = useState('')
  const [taskDocMeta, setTaskDocMeta] = useState<ReturnType<typeof getTaskDocumentMeta> | null>(null)
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null)
  const [removeExistingDoc, setRemoveExistingDoc] = useState(false)

  const isEditMode = editingTaskId !== null

  const loadStudents = useCallback(async () => {
    try {
      const response = await api.get('/users/students')
      setStudents(Array.isArray(response.data) ? response.data : [])
    } catch {
      setStudents([])
      message.error('加载学生列表失败')
    }
  }, [])

  const loadTasks = useCallback(async () => {
    try {
      const response = await api.get('/tasks')
      setTasks(Array.isArray(response.data) ? response.data : [])
    } catch {
      setTasks([])
    }
  }, [])

  useEffect(() => {
    loadStudents()
    loadTasks()
  }, [loadStudents, loadTasks])

  const resetForm = () => {
    setEditingTaskId(null)
    form.resetFields()
    form.setFieldsValue({
      title: '',
      type: undefined,
      content: '',
      student_ids: [],
      end_date: '',
      check_frequency: 7,
      doc_url: '',
      status: 'active'
    })
    setTaskDocMeta(null)
    setSelectedDocFile(null)
    setRemoveExistingDoc(false)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setLoading(true)
    try {
      const currentDocMeta = taskDocMeta
      const keepExistingDoc = currentDocMeta
        ? !selectedDocFile
          && !removeExistingDoc
          && (
            currentDocMeta.kind === 'file'
              ? !values.doc_url
              : values.doc_url === currentDocMeta.url
          )
        : false

      const endDateStr = dayjs.isDayjs(values.end_date) 
        ? values.end_date.format('YYYY-MM-DD')
        : values.end_date
      
      const formData = new FormData()
      formData.append('title', values.title)
      formData.append('type', values.type)
      formData.append('content', values.content || '')
      formData.append('student_ids', JSON.stringify(values.student_ids || []))
      formData.append('end_date', endDateStr)
      formData.append('check_frequency', String(values.check_frequency))
      formData.append('doc_url', values.doc_url || '')
      formData.append('status', values.status || 'active')
      formData.append('keep_existing_doc', keepExistingDoc ? 'true' : 'false')
      if (selectedDocFile) {
        formData.append('doc_file', selectedDocFile)
      }

      if (isEditMode) {
        await api.put(`/tasks/${editingTaskId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        message.success('任务修改成功')
      } else {
        await api.post('/tasks', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        message.success('任务发布成功')
      }
      resetForm()
      loadTasks()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '保存任务失败')
    } finally {
      setLoading(false)
    }
  }

  const editTask = (task: TaskItem) => {
    const currentTaskDocMeta = getTaskDocumentMeta(task)
    setEditingTaskId(task.id)
    setTaskDocMeta(currentTaskDocMeta)
    setSelectedDocFile(null)
    setRemoveExistingDoc(false)
    form.setFieldsValue({
      title: task.title,
      type: task.type,
      content: task.content,
      student_ids: Array.isArray(task.student_ids) ? task.student_ids : JSON.parse(task.student_ids || '[]'),
      end_date: dayjs(task.end_date),
      check_frequency: task.check_frequency,
      // doc_url 字段是"外部链接"输入框：仅链接类型回填，附件类型必须留空，
      // 否则提交时会被后端当作新链接处理，导致已上传的附件被删除
      doc_url: currentTaskDocMeta?.kind === 'link' ? currentTaskDocMeta.url : '',
      status: task.status
    })
  }

  const deleteTask = (task: TaskItem) => {
    Modal.confirm({
      title: `确定删除任务"${task.title}"吗？`,
      content: '删除后不可恢复，相关提交也将被删除',
      okText: '确定删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/tasks/${task.id}`)
          message.success('任务已删除')
          loadTasks()
        } catch (err: any) {
          message.error(err?.response?.data?.error || '删除任务失败')
        }
      }
    })
  }

  const viewSubmissions = useCallback(async (task: TaskItem) => {
    setCurrentTaskTitle(task.title)
    setSubmissionLoading(true)
    setSubmissionModalOpen(true)
    try {
      const response = await api.get(`/submissions/task/${task.id}`)
      setTaskSubmissions(Array.isArray(response.data) ? response.data : [])
    } catch {
      setTaskSubmissions([])
    } finally {
      setSubmissionLoading(false)
    }
  }, [])

  const submissionColumns: ColumnsType<SubmissionItem> = [
    { title: '学号', dataIndex: 'student_school_id', key: 'student_school_id', width: 120 },
    { title: '姓名', dataIndex: 'student_name', key: 'student_name', width: 100 },
    { title: '提交时间', key: 'submit_time', width: 160, render: (_: any, r: SubmissionItem) => formatDate(r.submit_time) },
    { title: '提交内容', key: 'content', ellipsis: true, render: (_: any, r: SubmissionItem) => getTextPreview(r.submit_content || '') },
    {
      title: '操作',
      key: 'action',
      width: 80,
      align: 'center' as const,
      render: (_: any, r: SubmissionItem) => (
        <Button type="default" shape="circle" size="small" icon={<EyeOutlined />} onClick={() => { sessionStorage.setItem('openSubmissionId', String(r.id)); navigate('/teacher/check') }} title="查看" />
      )
    }
  ]

  const columns: ColumnsType<TaskItem> = [
    { title: '序号', key: 'index', width: 50, align: 'center' as const, render: (_: any, __: any, i: number) => i + 1 },
    { title: '任务名称', dataIndex: 'title', key: 'title', width: 180, ellipsis: true as const },
    { title: '类型', key: 'type', width: 90, align: 'center' as const, render: (_: any, r: TaskItem) => <Tag color={getTagColor(r.type)}>{getTypeLabel(r.type)}</Tag> },
    { title: '截止日期', key: 'end_date', width: 100, align: 'center' as const, render: (_: any, r: TaskItem) => formatDate(r.end_date) },
    { title: '分配人数', key: 'assigned', width: 80, align: 'center' as const, render: (_: any, r: TaskItem) => { try { const ids = JSON.parse(String(r.student_ids || '[]')); return Array.isArray(ids) ? ids.length : 0 } catch { return 0 } } },
    { title: '频次', dataIndex: 'check_frequency', key: 'check_frequency', width: 80, align: 'center' as const, render: (v: number) => `${v}天` },
    { title: '状态', key: 'status', width: 80, align: 'center' as const, render: (_: any, r: TaskItem) => <Tag color={r.status === 'active' && getDeadlineTime(r.end_date) >= Date.now() ? 'green' : 'default'}>{r.status === 'active' && getDeadlineTime(r.end_date) >= Date.now() ? '进行中' : '已结束'}</Tag> },
    {
      title: '操作',
      key: 'action',
      width: 180,
      align: 'center' as const,
      render: (_: any, r: TaskItem) => (
        <Space size={12}>
          <EyeOutlined style={{ fontSize: 15, color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => viewSubmissions(r)} title="查看提交" />
          <Button type="default" shape="circle" size="small" icon={<EyeOutlined />} onClick={() => editTask(r)} style={{ display: 'none' }} />
          <span style={{ fontSize: 13, color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => editTask(r)}>编辑</span>
          <span style={{ fontSize: 13, color: '#ff4d4f', cursor: 'pointer' }} onClick={() => deleteTask(r)}>删除</span>
        </Space>
      )
    }
  ]

  return (
    <div className="page-shell">
      <Card className="compact-card" title="发布/编辑任务">
        <Form form={form} layout="horizontal" className="hform" labelCol={{ flex: '80px' }} wrapperCol={{ flex: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="title" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
                <Input placeholder="请输入任务名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="任务类型" rules={[{ required: true, message: '请选择任务类型' }]}>
                <Select placeholder="请选择任务类型" options={[
                  { value: 'development', label: '开发任务' },
                  { value: 'research', label: '研究任务' },
                  { value: 'paper', label: '论文写作' },
                  { value: 'experiment', label: '实验任务' },
                  { value: 'other', label: '其他任务' }
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="任务内容" rules={[{ required: true, message: '请输入任务内容' }]}>
            <TextArea rows={4} placeholder="请输入任务内容（支持富文本格式）" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="student_ids" label="分配学生" rules={[{ required: true, message: '请选择学生', type: 'array', min: 1 }]}>
                <Select mode="multiple" placeholder="请选择学生" showSearch optionFilterProp="label" options={students.map(s => ({ value: s.id, label: `${s.student_id} ${s.username}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="end_date" label="截止日期" rules={[{ required: true, message: '请选择截止日期' }]}>
                <DatePicker style={{ width: '100%' }} placeholder="选择截止日期" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="check_frequency" label="频次/天" rules={[{ required: true, message: '请输入检查频次' }]}>
                <Input type="number" min={1} max={30} placeholder="7" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="status" label="任务状态">
                <Select options={[{ value: 'active', label: '进行中' }, { value: 'completed', label: '已结束' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="doc_url" label="参考链接">
                <Input placeholder="可输入参考文档链接" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="任务附件">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Upload
                  accept=".pdf,.zip,.rar,.7z"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    setSelectedDocFile(file)
                    setRemoveExistingDoc(false)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />}>
                    {taskDocMeta ? '替换附件' : '选择文件'}
                  </Button>
                </Upload>
                <span className="muted-meta">支持 PDF 或压缩包格式（pdf/zip/rar/7z），不超过100MB</span>
              </Space>
              {selectedDocFile && (
                <div className="file-info">
                  <FolderOpenOutlined />
                  <span>{selectedDocFile.name}</span>
                  <Button type="link" size="small" onClick={() => setSelectedDocFile(null)}>取消替换</Button>
                </div>
              )}
              {!selectedDocFile && taskDocMeta && !removeExistingDoc && (
                <div className="file-info">
                  <FolderOpenOutlined />
                  <a href={taskDocMeta.url} target="_blank" rel="noreferrer">{taskDocMeta.name}</a>
                  <Button type="link" danger size="small" onClick={() => { Modal.confirm({ title: '确认移除', content: '确定要移除该附件吗？提交后生效。', okText: '确定移除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => setRemoveExistingDoc(true) }) }}>移除附件</Button>
                </div>
              )}
              {!selectedDocFile && taskDocMeta && removeExistingDoc && (
                <div className="file-info">
                  <FolderOpenOutlined />
                  <span>已移除原附件，提交后生效</span>
                  <Button type="link" size="small" onClick={() => setRemoveExistingDoc(false)}>撤销移除</Button>
                </div>
              )}
            </Space>
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" loading={loading} onClick={handleSubmit}>
                {isEditMode ? '保存修改' : '发布任务'}
              </Button>
              {isEditMode && <Button onClick={resetForm}>取消编辑</Button>}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card className="compact-card section-gap" title="任务列表">
        <Table
          rowKey="id"
          size="small"
          dataSource={tasks}
          columns={columns}
          scroll={{ x: 1000 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '30', '50'] }}
        />
      </Card>

      <Modal
        open={submissionModalOpen}
        title={`"${currentTaskTitle}" 的提交列表`}
        width={800}
        footer={null}
        onCancel={() => setSubmissionModalOpen(false)}
      >
        <Table
          rowKey="id"
          loading={submissionLoading}
          dataSource={taskSubmissions}
          columns={submissionColumns}
          size="small"
          pagination={false}
        />
      </Modal>
    </div>
  )
}
