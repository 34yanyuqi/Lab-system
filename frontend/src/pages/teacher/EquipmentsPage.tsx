import { useState, useCallback, useEffect, useMemo } from 'react'
import { Card, Form, Input, Button, Select, Row, Col, Space, Table, Modal, Checkbox, Tag, message, Upload, Image } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined, ImportOutlined, SearchOutlined, SettingOutlined, CheckOutlined, CloseOutlined, UploadOutlined, EyeOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import api from '@/api'
import { categoryOptions, equipmentAllColumns } from '@/config'
import type { EquipmentItem } from '@/types'
import DataImportModal from '@/components/common/DataImportModal'

export default function TeacherEquipmentsPage() {
  const [equipments, setEquipments] = useState<EquipmentItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterName, setFilterName] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined)
  const [filterSchoolCode, setFilterSchoolCode] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const isEditMode = editingId !== null
  const [colSettingVisible, setColSettingVisible] = useState(false)
  const [visibleCols, setVisibleCols] = useState<string[]>([
    'category', 'school_code', 'name', 'model', 'teacher_name',
    'student_school_id', 'student_name', 'status', 'location', 'purchase_date', 'remark'
  ])
  const [editingCell, setEditingCell] = useState<{ id: number; key: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewVisible, setPreviewVisible] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  const filteredEquipments = useMemo(() => {
    return equipments.filter(e => {
      if (filterName && !e.name.includes(filterName)) return false
      if (filterCategory && e.category !== filterCategory) return false
      if (filterSchoolCode && !e.school_code.includes(filterSchoolCode)) return false
      if (filterLocation && !e.location.includes(filterLocation)) return false
      if (filterStatus === 'used' && !e.student_school_id && !e.teacher_name) return false
      if (filterStatus === 'unused' && (e.student_school_id || e.teacher_name)) return false
      return true
    })
  }, [equipments, filterName, filterCategory, filterSchoolCode, filterLocation, filterStatus])

  const loadEquipments = useCallback(async () => {
    const response = await api.get('/equipments')
    setEquipments(response.data)
  }, [])

  useEffect(() => { loadEquipments() }, [loadEquipments])

  const handlePreviewImage = (url: string) => {
    setPreviewImage(url)
    setPreviewVisible(true)
  }

  const handleUploadImage = async (file: File) => {
    if (!editingId) {
      message.warning('请先保存设备基本信息后再上传图片')
      return false
    }
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('equipment_image', file)
      await api.post(`/equipments/${editingId}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      message.success('图片上传成功')
      loadEquipments()
      return false
    } catch (error: any) {
      message.error(error.response?.data?.error || '图片上传失败')
      return false
    } finally {
      setUploadingImage(false)
    }
  }

  const handleDeleteImage = async (id: number) => {
    Modal.confirm({
      title: '确认删除', content: '确定要删除该设备的图片吗？', okText: '确定', cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/equipments/${id}/image`)
          message.success('图片已删除')
          loadEquipments()
        } catch (error: any) {
          message.error(error.response?.data?.error || '删除图片失败')
        }
      }
    })
  }

  const resetForm = () => { setEditingId(null); form.resetFields() }

  const openCreate = () => { resetForm(); setModalOpen(true) }

  const openEdit = (item: EquipmentItem) => {
    setEditingId(item.id)
    form.setFieldsValue({
      category: item.category, school_code: item.school_code, serial_number: item.serial_number,
      name: item.name, value: item.value, model: item.model, teacher_name: item.teacher_name,
      student_school_id: item.student_school_id, student_name: item.student_name,
      location: item.location, purchase_date: item.purchase_date, remark: item.remark
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEditMode) {
        await api.put(`/equipments/${editingId}`, values)
        message.success('设备信息已更新')
      } else {
        await api.post('/equipments', values)
        message.success('设备已新增')
      }
      setModalOpen(false); resetForm(); loadEquipments()
    } catch (err: any) {
      message.error(err?.response?.data?.error || '保存设备失败')
    } finally { setSaving(false) }
  }

  const handleDelete = (item: EquipmentItem) => {
    Modal.confirm({
      title: `确定删除设备"${item.name}"吗？`, okText: '确定', cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/equipments/${item.id}`)
        } catch (err: any) {
          message.error(err?.response?.data?.error || '删除设备失败')
          return
        }
        message.success('设备已删除')
        setSelectedRowKeys(prev => prev.filter(k => k !== item.id))
        loadEquipments()
      }
    })
  }

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要删除的设备'); return }
    Modal.confirm({
      title: `确定删除选中的 ${selectedRowKeys.length} 条设备记录吗？`, content: '删除后不可恢复',
      okText: '确定删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => {
        const res = await api.post('/equipments/batch-delete', { ids: selectedRowKeys.map(id => Number(id)) })
        message.success(res.data?.message || `已删除 ${selectedRowKeys.length} 条设备记录`)
        setSelectedRowKeys([]); loadEquipments()
      }
    })
  }

  const handleExportEquipments = useCallback(() => {
    const hasSelection = selectedRowKeys.length > 0
    const exportData = hasSelection ? filteredEquipments.filter(e => selectedRowKeys.includes(e.id)) : filteredEquipments
    Modal.confirm({
      title: '导出设备数据',
      content: hasSelection ? `确定导出选中的 ${exportData.length} 条设备数据吗？` : `确定导出当前筛选的 ${exportData.length} 条设备数据吗？`,
      okText: '确定导出', cancelText: '取消',
      onOk: () => {
        const colMap = equipmentAllColumns.filter(c => visibleCols.includes(c.key))
        const header = colMap.map(c => c.label)
        const rows = exportData.map(item => colMap.map(c => (item as any)[c.key] ?? ''))
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '设备数据')
        XLSX.writeFile(wb, `设备数据_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`)
      }
    })
  }, [filteredEquipments, visibleCols, selectedRowKeys])

  const strSort = (a: string, b: string) => (a || '').localeCompare(b || '')

  const getStatusText = (item: EquipmentItem) => {
    if (!item.student_school_id) {
      if (!item.teacher_name) return { text: '未领用', color: 'default' }
      return { text: `已领用(${item.teacher_name})`, color: 'blue' }
    }
    return { text: `已被${item.student_name}领用`, color: 'orange' }
  }

  const handleDoubleClick = (record: EquipmentItem, key: string) => {
    setEditingCell({ id: record.id, key })
    setEditValue((record as any)[key] || '')
  }

  const saveEdit = (currentEditingCell: { id: number; key: string }, value: string) => {
    Modal.confirm({
      title: '确认修改', content: '确定保存此单元格的修改吗？', okText: '保存', cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/equipments/${currentEditingCell.id}`, { [currentEditingCell.key]: value })
          message.success('修改成功')
          loadEquipments()
          setEditingCell(null)
        } catch (err: any) { message.error(err.response?.data?.error || '修改失败') }
      },
      onCancel: () => { setEditingCell(null) }
    })
  }

  const makeColumnDef = (key: string, title: string, width: number, useSmallFont = false) => ({
    title, dataIndex: key, key, width,
    sorter: (a: EquipmentItem, b: EquipmentItem) => strSort((a as any)[key], (b as any)[key]),
    onCell: (record: EquipmentItem) => ({
      style: { whiteSpace: 'nowrap', cursor: editingCell?.id === record.id && editingCell?.key === key ? 'text' : 'pointer' },
      onDoubleClick: () => {
        if (!(editingCell?.id === record.id && editingCell?.key === key)) handleDoubleClick(record, key)
      }
    }),
    render: (value: any, record: EquipmentItem) => {
      if (editingCell?.id === record.id && editingCell?.key === key) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Input autoFocus size="small" value={editValue} onChange={(e) => setEditValue(e.target.value)} style={{ flex: 1 }} />
            <CheckOutlined style={{ color: '#52c41a', cursor: 'pointer', fontSize: 14 }} onClick={() => saveEdit(editingCell!, editValue)} />
            <CloseOutlined style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 14 }} onClick={() => setEditingCell(null)} />
          </div>
        )
      }
      return useSmallFont ? <span style={{ fontSize: '12px' }}>{value || '-'}</span> : (value || '-')
    }
  })

  const filteredColumns = [
    { key: 'category', title: '类别', width: 80 },
    { key: 'school_code', title: '校内编号', width: 110 },
    { key: 'serial_number', title: '设备序列号', width: 130 },
    { key: 'name', title: '设备名称', width: 120 },
    { key: 'value', title: '价值', width: 80 },
    { key: 'model', title: '型号', width: 100 },
    { key: 'teacher_name', title: '领用导师', width: 90 },
    { key: 'student_school_id', title: '使用学生学号', width: 110 },
    { key: 'student_name', title: '使用学生姓名', width: 100 },
    { key: 'status', title: '领用状态', width: 160 },
    { key: 'location', title: '存放地址', width: 120 },
    { key: 'purchase_date', title: '购置日期', width: 100 },
    { key: 'remark', title: '备注', width: 120 }
  ]

  const smallFontKeys = new Set(['model', 'location', 'remark'])

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="card-head">
          <Space wrap size={8} style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>设备管理</h3>
            <Input placeholder="设备名称" allowClear value={filterName} onChange={e => setFilterName(e.target.value)} style={{ width: 120 }} prefix={<SearchOutlined />} />
            <Select placeholder="类别" allowClear value={filterCategory} onChange={setFilterCategory} style={{ width: 100 }} options={categoryOptions} />
            <Select placeholder="领用状态" allowClear value={filterStatus} onChange={setFilterStatus} style={{ width: 100 }} options={[
              { value: 'used', label: '已领用' },
              { value: 'unused', label: '未领用' }
            ]} />
            <Input placeholder="校内编号" allowClear value={filterSchoolCode} onChange={e => setFilterSchoolCode(e.target.value)} style={{ width: 120 }} />
            <Input placeholder="存放地址" allowClear value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={{ width: 120 }} />
            {(filterName || filterCategory || filterStatus || filterSchoolCode || filterLocation) && (
              <Button size="small" onClick={() => { setFilterName(''); setFilterCategory(undefined); setFilterStatus(undefined); setFilterSchoolCode(''); setFilterLocation('') }}>清除筛选</Button>
            )}
            <Button danger icon={<DeleteOutlined />} onClick={handleBatchDelete} disabled={selectedRowKeys.length === 0}>
              删除选中{selectedRowKeys.length > 0 ? `（${selectedRowKeys.length}）` : ''}
            </Button>
            <Button icon={<ExportOutlined />} onClick={handleExportEquipments}>
              {selectedRowKeys.length > 0 ? `导出数据（${selectedRowKeys.length}）` : '导出全部数据'}
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>导入数据</Button>
            <Button icon={<SettingOutlined />} onClick={() => setColSettingVisible(true)}>设置显示列</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增设备</Button>
          </Space>
        </div>
        <Table
          rowKey="id" size="small" dataSource={filteredEquipments} scroll={{ x: 'max-content' }}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{ current: currentPage, pageSize, showSizeChanger: true, pageSizeOptions: ['10', '20', '30', '40', '50'], showTotal: (total) => `共 ${total} 条` }}
          onChange={(pagination) => { setCurrentPage(pagination.current || 1); if (pagination.pageSize !== pageSize) { setPageSize(pagination.pageSize!); setCurrentPage(1) } }}
          columns={[
            { title: '图片', key: 'image', width: 80, fixed: 'left' as const, render: (_: any, row: EquipmentItem) => {
              if (row.image_url) {
                return (
                  <Image
                    width={40}
                    height={40}
                    src={row.image_url}
                    style={{ objectFit: 'cover', cursor: 'pointer', borderRadius: 4 }}
                    preview={{ src: row.image_url }}
                  />
                )
              }
              return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>无图</span>
            }},
            { title: '行号', key: 'rowNum', width: 60, fixed: 'left' as const, render: (_: any, __: any, index: number) => (currentPage - 1) * pageSize + index + 1 },
            ...filteredColumns.filter(c => visibleCols.includes(c.key)).map(c => {
              if (c.key === 'status') {
                return {
                  title: c.title,
                  key: c.key,
                  width: c.width,
                  sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(getStatusText(a).text, getStatusText(b).text),
                  render: (_: any, row: EquipmentItem) => {
                    const status = getStatusText(row)
                    return <Tag color={status.color}>{status.text}</Tag>
                  }
                }
              }
              return makeColumnDef(c.key, c.title, c.width, smallFontKeys.has(c.key))
            }),
            { title: '操作', key: 'action', width: 110, fixed: 'right' as const, align: 'center', render: (_: any, row: EquipmentItem) => (<Space size={12}><EditOutlined style={{ fontSize: 15, color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => openEdit(row)} title="编辑" /><DeleteOutlined style={{ fontSize: 15, color: '#ff4d4f', cursor: 'pointer' }} onClick={() => handleDelete(row)} title="删除" /></Space>) }
          ]}
        />
      </Card>

      <Modal open={modalOpen} title={isEditMode ? '编辑设备' : '新增设备'} okText={isEditMode ? '保存修改' : '确认新增'} cancelText="取消" confirmLoading={saving} onOk={handleSave} onCancel={() => setModalOpen(false)} width={720}>
        <Form form={form} layout="horizontal" className="hform" labelCol={{ flex: '90px' }} wrapperCol={{ flex: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="category" label="类别" rules={[{ required: true, message: '请选择类别' }]}><Select placeholder="请选择类别" options={categoryOptions} /></Form.Item></Col>
            <Col span={12}><Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}><Input placeholder="请输入设备名称" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="school_code" label="校内编号"><Input placeholder="请输入校内编号" /></Form.Item></Col>
            <Col span={12}><Form.Item name="serial_number" label="序列号"><Input placeholder="请输入序列号" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="value" label="价值"><Input placeholder="请输入价值" /></Form.Item></Col>
            <Col span={12}><Form.Item name="purchase_date" label="购置日期"><Input placeholder="如：2024-01-15" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}><Form.Item name="model" label="型号"><Input placeholder="请输入型号" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="teacher_name" label="领用导师"><Input placeholder="请输入领用导师" /></Form.Item></Col>
            <Col span={12}><Form.Item name="student_school_id" label="使用学生学号"><Input placeholder="请输入学生学号" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="student_name" label="使用学生姓名"><Input placeholder="请输入学生姓名" /></Form.Item></Col>
            <Col span={12}><Form.Item name="location" label="存放地址"><Input placeholder="请输入存放地址" /></Form.Item></Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} placeholder="请输入备注" /></Form.Item>
          <Form.Item label="设备图片">
            <Space direction="vertical" style={{ width: '100%' }}>
              {isEditMode && editingId && (() => {
                const currentEquipment = equipments.find(e => e.id === editingId)
                if (currentEquipment?.image_url) {
                  return (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <Image
                        width={120}
                        height={120}
                        src={currentEquipment.image_url}
                        style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }}
                      />
                      <div style={{ marginTop: 8 }}>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreviewImage(currentEquipment.image_url!)} style={{ marginRight: 8 }}>预览</Button>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteImage(editingId!)}>删除</Button>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
              {isEditMode && (
                <div>
                  <Upload
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    showUploadList={false}
                    beforeUpload={handleUploadImage}
                    disabled={uploadingImage}
                  >
                    <Button icon={<UploadOutlined />} loading={uploadingImage}>
                      {uploadingImage ? '上传中...' : '上传图片'}
                    </Button>
                  </Upload>
                  <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
                    支持 PNG、JPEG、WebP 和 GIF 格式，最大 10MB
                  </div>
                </div>
              )}
              {!isEditMode && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  新增设备后，可在编辑模式下上传图片
                </div>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={colSettingVisible} title="设置显示列" okText="确定" cancelText="取消" onOk={() => setColSettingVisible(false)} onCancel={() => setColSettingVisible(false)} width={480}>
        <Checkbox.Group value={visibleCols} onChange={vals => setVisibleCols(vals as string[])} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {equipmentAllColumns.map(col => (<Checkbox key={col.key} value={col.key} style={{ width: 140 }}>{col.label}</Checkbox>))}
        </Checkbox.Group>
      </Modal>

      <DataImportModal
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onSuccess={() => { setImportModalVisible(false); loadEquipments(); }}
        tableKey="equipments"
        tableLabel="设备"
      />

      <Modal
        open={previewVisible}
        title="图片预览"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
      >
        <img alt="设备图片预览" style={{ width: '100%' }} src={previewImage} />
      </Modal>
    </div>
  )
}
