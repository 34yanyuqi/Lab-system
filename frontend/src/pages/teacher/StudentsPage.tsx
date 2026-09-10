import { useState, useCallback, useEffect, useMemo } from 'react'
import { Card, Form, Input, Button, Select, Row, Col, Space, Table, Modal, Checkbox, message } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined, ImportOutlined, SearchOutlined, SettingOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import api from '@/api'
import { formatDate } from '@/utils/format'
import { gradeOptions, studentAllColumns } from '@/config'
import { useMajorList } from '@/contexts'
import type { StudentItem } from '@/types'
import * as XLSX from 'xlsx'
import DataImportModal from '@/components/common/DataImportModal'

export default function TeacherStudentsPage() {
  const majorList = useMajorList()
  const [students, setStudents] = useState<StudentItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterMajor, setFilterMajor] = useState<string | undefined>(undefined)
  const [filterGrade, setFilterGrade] = useState<string | undefined>(undefined)
  const [filterName, setFilterName] = useState('')
  const [form] = Form.useForm()
  const isEditMode = editingId !== null
  const [studentEditingCell, setStudentEditingCell] = useState<{ id: number; key: string } | null>(null)
  const [studentEditValue, setStudentEditValue] = useState('')
  const [colSettingVisible, setColSettingVisible] = useState(false)
  const [visibleCols, setVisibleCols] = useState<string[]>([
    'username', 'student_id', 'student_grade', 'student_major',
    'student_email', 'graduate_year', 'student_phone', 'student_id_card',
    'student_bank_card', 'student_bank_name', 'create_time'
  ])
  const [importModalVisible, setImportModalVisible] = useState(false)

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (filterMajor && s.student_major !== filterMajor) return false
      if (filterGrade && s.student_grade !== filterGrade) return false
      if (filterName && !s.username.includes(filterName) && !s.student_id.includes(filterName)) return false
      return true
    })
  }, [students, filterMajor, filterGrade, filterName])

  const majorOptions = useMemo(() => {
    const majors = [...new Set(students.map(s => s.student_major).filter(Boolean))]
    return majors.sort().map(m => ({ value: m, label: m }))
  }, [students])

  const gradeOptionsFromData = useMemo(() => {
    const grades = [...new Set(students.map(s => s.student_grade).filter(Boolean))]
    return grades.sort().map(g => ({ value: g, label: g }))
  }, [students])

  const loadStudents = useCallback(async () => {
    try {
      const response = await api.get('/users/students')
      setStudents(Array.isArray(response.data) ? response.data : [])
    } catch {
      setStudents([])
      message.error('加载学生列表失败')
    }
  }, [])

  useEffect(() => { loadStudents() }, [loadStudents])

  const resetForm = () => { setEditingId(null); form.resetFields() }

  const openCreate = () => { resetForm(); setModalOpen(true) }

  const openEdit = (student: StudentItem) => {
    setEditingId(student.id)
    const normalizeGrade = (v: string) => (v || '').replace(/级$/, '')
    form.setFieldsValue({
      username: student.username,
      student_id: student.student_id,
      student_grade: normalizeGrade(student.student_grade),
      student_major: student.student_major,
      student_email: student.student_email,
      graduate_year: (student.graduate_year || '').replace(/级$/, ''),
      password: '',
      confirmPassword: ''
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        username: values.username,
        student_id: values.student_id,
        student_grade: values.student_grade,
        student_major: values.student_major,
        student_email: values.student_email,
        graduate_year: values.graduate_year,
        password: values.password || undefined
      }
      if (isEditMode) {
        await api.put(`/users/students/${editingId}`, payload)
        message.success('学生信息已更新')
      } else {
        await api.post('/users/students', payload)
        message.success('学生已新增')
      }
      setModalOpen(false)
      resetForm()
      loadStudents()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '保存失败')
    } finally { setSaving(false) }
  }

  const handleDelete = (student: StudentItem) => {
    Modal.confirm({
      title: `确定删除学生"${student.username}"吗？`,
      okText: '确定', cancelText: '取消',
      onOk: async () => {
        await api.delete(`/users/students/${student.id}`)
        message.success('学生已删除')
        loadStudents()
      }
    })
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要删除的学生'); return }
    Modal.confirm({
      title: `确定删除选中的 ${selectedRowKeys.length} 名学生吗？`,
      content: '删除后不可恢复，相关提交记录也将被删除',
      okText: '确定删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => {
        await api.post('/users/students/batch-delete', { ids: selectedRowKeys })
        message.success(`已删除 ${selectedRowKeys.length} 名学生`)
        setSelectedRowKeys([])
        loadStudents()
      }
    })
  }

  const handleExportStudents = useCallback(() => {
    const hasSelection = selectedRowKeys.length > 0
    const exportData = hasSelection ? filteredStudents.filter(s => selectedRowKeys.includes(s.id)) : filteredStudents
    Modal.confirm({
      title: '导出学生数据',
      content: hasSelection ? `确定导出选中的 ${exportData.length} 条学生数据吗？` : `确定导出当前筛选的 ${exportData.length} 条学生数据吗？`,
      okText: '确定导出', cancelText: '取消',
      onOk: () => {
        const colMap = studentAllColumns.filter(c => visibleCols.includes(c.key))
        const header = colMap.map(c => c.label)
        const rows = exportData.map(item => colMap.map(c => {
          if (c.key === 'create_time') return formatDate((item as any)[c.key])
          return (item as any)[c.key] ?? ''
        }))
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '学生数据')
        XLSX.writeFile(wb, `学生数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`)
      }
    })
  }, [filteredStudents, visibleCols, selectedRowKeys])

  const handleStudentDoubleClick = (record: StudentItem, key: string) => {
    setStudentEditingCell({ id: record.id, key })
    setStudentEditValue((record as any)[key] || '')
  }

  const saveStudentEdit = (editingCell: { id: number; key: string }, value: string) => {
    Modal.confirm({
      title: '确认修改', content: '确定保存此单元格的修改吗？', okText: '保存', cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/users/students/${editingCell.id}`, { [editingCell.key]: value })
          message.success('修改成功')
          loadStudents()
          setStudentEditingCell(null)
        } catch (err: any) { message.error(err.response?.data?.error || '修改失败') }
      },
      onCancel: () => { setStudentEditingCell(null) }
    })
  }

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="card-head card-head-between">
          <div><h3>学生管理</h3></div>
          <Space wrap>
            <Input placeholder="按姓名/学号搜索" allowClear value={filterName} onChange={e => setFilterName(e.target.value)} style={{ width: 160 }} prefix={<SearchOutlined />} />
            <Select placeholder="按专业筛选" allowClear value={filterMajor} onChange={setFilterMajor} style={{ width: 150 }} options={majorOptions} />
            <Select placeholder="按年级筛选" allowClear value={filterGrade} onChange={setFilterGrade} style={{ width: 120 }} options={gradeOptionsFromData} />
            {(filterName || filterMajor || filterGrade) && (
              <Button size="small" onClick={() => { setFilterName(''); setFilterMajor(undefined); setFilterGrade(undefined) }}>清除筛选</Button>
            )}
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete} disabled={selectedRowKeys.length === 0}>
              删除选中{selectedRowKeys.length > 0 ? `（${selectedRowKeys.length}）` : ''}
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExportStudents}>
              {selectedRowKeys.length > 0 ? `导出数据（${selectedRowKeys.length}）` : '导出全部数据'}
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>导入数据</Button>
            <Button icon={<SettingOutlined />} onClick={() => setColSettingVisible(true)}>设置显示列</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增学生</Button>
          </Space>
        </div>
        <Table
          rowKey="id" size="small" dataSource={filteredStudents} scroll={{ x: 'max-content' }}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ current: currentPage, pageSize, showSizeChanger: true, pageSizeOptions: ['10', '20', '30', '40', '50'], showTotal: (total) => `共 ${total} 条` }}
          onChange={(pagination) => { setCurrentPage(pagination.current || 1); if (pagination.pageSize !== pageSize) { setPageSize(pagination.pageSize!); setCurrentPage(1) } }}
          columns={[
            { title: '行号', key: 'rowNum', width: 60, fixed: 'left' as const, render: (_: any, __: any, index: number) => (currentPage - 1) * pageSize + index + 1 },
            ...studentAllColumns.filter(c => visibleCols.includes(c.key)).map(c => ({
              title: c.label, dataIndex: c.key, key: c.key, width: c.key === 'student_id_card' || c.key === 'student_bank_card' ? 180 : c.key === 'student_email' ? 180 : c.key === 'student_major' ? 130 : 100,
              sorter: (a: any, b: any) => String(a[c.key] || '').localeCompare(String(b[c.key] || '')),
              onCell: (record: StudentItem) => ({ style: { cursor: studentEditingCell?.id === record.id && studentEditingCell?.key === c.key ? 'text' : 'pointer' }, onDoubleClick: () => { if (!(studentEditingCell?.id === record.id && studentEditingCell?.key === c.key)) handleStudentDoubleClick(record, c.key) } }),
              render: (value: any, record: StudentItem) => studentEditingCell?.id === record.id && studentEditingCell?.key === c.key ? (<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Input autoFocus size="small" value={studentEditValue} onChange={(e) => setStudentEditValue(e.target.value)} style={{ flex: 1 }} /><CheckOutlined style={{ color: '#52c41a', cursor: 'pointer', fontSize: 14 }} onClick={() => saveStudentEdit(studentEditingCell!, studentEditValue)} /><CloseOutlined style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 14 }} onClick={() => setStudentEditingCell(null)} /></div>) : (value || '-')
            })),
            { title: '操作', key: 'action', width: 110, fixed: 'right' as const, align: 'center', render: (_: any, row: StudentItem) => (<Space size={12}><EditOutlined style={{ fontSize: 15, color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => openEdit(row)} title="编辑" /><DeleteOutlined style={{ fontSize: 15, color: '#ff4d4f', cursor: 'pointer' }} onClick={() => handleDelete(row)} title="删除" /></Space>) }
          ]}
        />
      </Card>

      <Modal open={modalOpen} title={isEditMode ? '编辑学生' : '新增学生'} okText={isEditMode ? '保存修改' : '确认新增'} cancelText="取消" confirmLoading={saving} onOk={handleSave} onCancel={() => setModalOpen(false)} width={720}>
        <Form form={form} layout="horizontal" className="hform" labelCol={{ flex: '90px' }} wrapperCol={{ flex: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}><Input placeholder="请输入用户名" /></Form.Item></Col>
            <Col span={12}><Form.Item name="student_id" label="学号" rules={[{ required: true, message: '请输入学号' }, { max: 12, message: '学号不超过12位' }, { pattern: /^[A-Za-z0-9]+$/, message: '仅允许字母和数字' }]}><Input placeholder="请输入学号" maxLength={12} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="student_grade" label="年级" rules={[{ required: true, message: '请选择年级' }]}><Select placeholder="请选择年级" options={gradeOptions} /></Form.Item></Col>
            <Col span={12}><Form.Item name="graduate_year" label="毕业年份" rules={[{ required: true, message: '请选择毕业年份' }]}><Select placeholder="请选择毕业年份" options={Array.from({ length: 17 }, (_, i) => ({ value: String(2024 + i), label: String(2024 + i) }))} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="student_major" label="专业" rules={[{ required: true, message: '请选择专业' }]}><Select placeholder="请选择专业" showSearch allowClear options={[{ value: '计算机科学与技术', label: '计算机科学与技术' }, { value: '计算机应用', label: '计算机应用' }, { value: '软件工程', label: '软件工程' }, { value: '人工智能', label: '人工智能' }, ...majorList.filter(m => !['计算机科学与技术', '计算机应用', '软件工程', '人工智能'].includes(m)).map(m => ({ value: m, label: m }))]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="student_email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入正确的邮箱格式' }]}><Input placeholder="请输入邮箱" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="password" label={isEditMode ? '新密码' : '密码'} rules={isEditMode ? [{ min: 6, message: '密码长度不能少于6位' }] : [{ required: true, message: '请输入密码' }, { min: 6, message: '密码长度不能少于6位' }]}><Input.Password placeholder={isEditMode ? '留空则不修改' : '请输入密码'} /></Form.Item></Col>
            <Col span={12}><Form.Item name="confirmPassword" label="确认密码" dependencies={['password']} rules={[({ getFieldValue }) => ({ validator(_: any, value: string) { const passwordValue = getFieldValue('password'); if (!passwordValue && isEditMode) return Promise.resolve(); if (!value) return Promise.reject(new Error('请确认密码')); if (value === passwordValue) return Promise.resolve(); return Promise.reject(new Error('两次输入的密码不一致')) } })]}><Input.Password placeholder="请再次输入密码" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal open={colSettingVisible} title="设置显示列" okText="确定" cancelText="取消" onOk={() => setColSettingVisible(false)} onCancel={() => setColSettingVisible(false)} width={480}>
        <Checkbox.Group value={visibleCols} onChange={vals => setVisibleCols(vals as string[])} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {studentAllColumns.map(col => (<Checkbox key={col.key} value={col.key} style={{ width: 140 }}>{col.label}</Checkbox>))}
        </Checkbox.Group>
      </Modal>

      <DataImportModal
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onSuccess={() => { setImportModalVisible(false); loadStudents(); }}
        tableKey="students"
        tableLabel="学生"
      />
    </div>
  )
}
