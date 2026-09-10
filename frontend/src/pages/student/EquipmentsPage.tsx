import { useState, useEffect, useMemo } from 'react'
import { Card, Table, Modal, Form, Button, Input, Select, Space, Checkbox, Tag, message, Image, Upload } from 'antd'
import { SearchOutlined, FilterOutlined, SettingOutlined, ImportOutlined, ExportOutlined, UploadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '@/api'
import { useAuth } from '@/contexts'
import type { EquipmentItem } from '@/types'

export default function StudentEquipmentsPage() {
  const { user } = useAuth()
  const [equipments, setEquipments] = useState<EquipmentItem[]>([])
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [filterName, setFilterName] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined)
  const [filterSchoolCode, setFilterSchoolCode] = useState('')
  const [filterSerialNumber, setFilterSerialNumber] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [colSettingVisible, setColSettingVisible] = useState(false)
  const [filterVisible, setFilterVisible] = useState(false)
  const [visibleCols, setVisibleCols] = useState<string[]>([
    'category', 'school_code', 'name', 'model', 'teacher_name',
    'student_school_id', 'student_name', 'location', 'purchase_date', 'remark', 'status', 'image'
  ])
  const [form] = Form.useForm()
  const [previewImage, setPreviewImage] = useState<string>('')
  const [previewVisible, setPreviewVisible] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageModalEquipment, setImageModalEquipment] = useState<EquipmentItem | null>(null)

  const categoryOptions = [
    { value: '家具', label: '家具' },
    { value: '软件', label: '软件' },
    { value: '设备', label: '设备' },
    { value: '低值设备', label: '低值设备' }
  ]

  const statusOptions = [
    { value: 'available', label: '可领用' },
    { value: 'borrowed-by-me', label: '我领用' },
    { value: 'borrowed-by-others', label: '已被领用' }
  ]

  const allColumns: Array<{ key: string; label: string }> = [
    { key: 'image', label: '图片' },
    { key: 'category', label: '类别' },
    { key: 'school_code', label: '校内编号' },
    { key: 'serial_number', label: '设备序列号' },
    { key: 'name', label: '设备名称' },
    { key: 'value', label: '价值' },
    { key: 'model', label: '型号' },
    { key: 'teacher_name', label: '领用导师' },
    { key: 'student_school_id', label: '使用学生学号' },
    { key: 'student_name', label: '使用学生姓名' },
    { key: 'location', label: '存放地址' },
    { key: 'purchase_date', label: '购置日期' },
    { key: 'remark', label: '备注' },
    { key: 'status', label: '状态' }
  ]

  const filteredEquipments = useMemo(() => {
    return equipments.filter(e => {
      if (filterName && !e.name.includes(filterName)) return false
      if (filterCategory && e.category !== filterCategory) return false
      if (filterSchoolCode && !e.school_code.includes(filterSchoolCode)) return false
      if (filterSerialNumber && !e.serial_number.includes(filterSerialNumber)) return false
      if (filterLocation && !e.location.includes(filterLocation)) return false
      if (filterStatus) {
        const isBorrowed = !!e.student_school_id
        const isBorrowedByMe = e.student_school_id === user?.student_id
        if (filterStatus === 'available' && isBorrowed) return false
        if (filterStatus === 'borrowed-by-me' && !isBorrowedByMe) return false
        if (filterStatus === 'borrowed-by-others' && (!isBorrowed || isBorrowedByMe)) return false
      }
      return true
    })
  }, [equipments, filterName, filterCategory, filterSchoolCode, filterSerialNumber, filterLocation, filterStatus, user?.student_id])

  const loadEquipments = useMemo(() => async () => {
    const response = await api.get('/equipments')
    setEquipments(response.data)
  }, [])

  useEffect(() => {
    loadEquipments()
  }, [loadEquipments])

  const handlePreviewImage = (url: string) => {
    setPreviewImage(url)
    setPreviewVisible(true)
  }

  const handleUploadImage = async (file: File) => {
    if (!imageModalEquipment) return false
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('equipment_image', file)
      await api.post(`/equipments/${imageModalEquipment.id}/upload-image`, formData, {
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

  const handleDeleteImage = async (equipment: EquipmentItem) => {
    Modal.confirm({
      title: '确认删除', content: '确定要删除该设备的图片吗？', okText: '确定', cancelText: '取消',
      onOk: async () => {
        try {
          await api.delete(`/equipments/${equipment.id}/image`)
          message.success('图片已删除')
          loadEquipments()
          setImageModalEquipment(null)
        } catch (error: any) {
          message.error(error.response?.data?.error || '删除图片失败')
        }
      }
    })
  }

  const openImageModal = (equipment: EquipmentItem) => {
    setImageModalEquipment(equipment)
  }

  const handleBorrow = (item: EquipmentItem) => {
    Modal.confirm({
      title: '领用设备',
      content: `确定要领用设备"${item.name}"吗？`,
      okText: '确定领用',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/equipments/${item.id}/borrow`)
          message.success('设备领用成功')
          loadEquipments()
        } catch (err: any) {
          message.error(err.response?.data?.error || '领用失败')
        }
      }
    })
  }

  const handleReturn = (item: EquipmentItem) => {
    Modal.confirm({
      title: '归还设备',
      content: `确定要归还设备"${item.name}"吗？`,
      okText: '确定归还',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.put(`/equipments/${item.id}/return`)
          message.success('设备归还成功')
          loadEquipments()
        } catch (err: any) {
          message.error(err.response?.data?.error || '归还失败')
        }
      }
    })
  }

  const getStatusText = (item: EquipmentItem) => {
    if (!item.student_school_id) return { text: '可领用', color: 'green' }
    if (item.student_school_id === user?.student_id) return { text: '我领用', color: 'blue' }
    return { text: `已被${item.student_name}领用`, color: 'orange' }
  }

  const strSort = (a: string, b: string) => (a || '').localeCompare(b || '')

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterName) count++
    if (filterCategory) count++
    if (filterStatus) count++
    if (filterSchoolCode) count++
    if (filterSerialNumber) count++
    if (filterLocation) count++
    return count
  }, [filterName, filterCategory, filterStatus, filterSchoolCode, filterSerialNumber, filterLocation])

  const handleOpenFilter = () => {
    form.setFieldsValue({
      filterName,
      filterCategory,
      filterStatus,
      filterSchoolCode,
      filterSerialNumber,
      filterLocation
    })
    setFilterVisible(true)
  }

  const handleApplyFilter = () => {
    const values = form.getFieldsValue()
    setFilterName(values.filterName || '')
    setFilterCategory(values.filterCategory)
    setFilterStatus(values.filterStatus)
    setFilterSchoolCode(values.filterSchoolCode || '')
    setFilterSerialNumber(values.filterSerialNumber || '')
    setFilterLocation(values.filterLocation || '')
    setFilterVisible(false)
  }

  const handleClearFilter = () => {
    form.resetFields()
    setFilterName('')
    setFilterCategory(undefined)
    setFilterStatus(undefined)
    setFilterSchoolCode('')
    setFilterSerialNumber('')
    setFilterLocation('')
    setFilterVisible(false)
  }

  return (
    <div className="page-shell">
      <Card className="compact-card">
        <div className="card-head">
          <Space wrap size={8} style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>设备管理</h3>
            <Input
              placeholder="设备名称"
              allowClear
              value={filterName}
              onChange={e => setFilterName(e.target.value)}
              style={{ width: 120 }}
              prefix={<SearchOutlined />}
            />
            <Select
              placeholder="状态"
              allowClear
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 100 }}
              options={statusOptions}
            />
            <Button 
              icon={<FilterOutlined />} 
              onClick={handleOpenFilter}
              type={activeFilterCount > 0 ? 'primary' : 'default'}
            >
              筛选{activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => setColSettingVisible(true)}>
              设置显示列
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          size="small"
          dataSource={filteredEquipments}
          scroll={{ x: 'max-content' }}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          pagination={{
            current: currentPage,
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '30', '40', '50'],
            showTotal: (total) => `共 ${total} 条`
          }}
          onChange={(pagination) => {
            setCurrentPage(pagination.current || 1)
            if (pagination.pageSize !== pageSize) {
              setPageSize(pagination.pageSize!)
              setCurrentPage(1)
            }
          }}
          components={{
            header: {
              cell: (props: any) => {
                const { onResize, width, ...rest } = props
                if (!width) return <th {...rest} />
                return (
                  <th {...rest} style={{ ...rest.style, position: 'relative' }}>
                    {rest.children}
                    <div
                      onMouseDown={(e: any) => {
                        const startX = e.clientX
                        const startWidth = width
                        const onMouseMove = (e: any) => {
                          const newWidth = Math.max(startWidth + e.clientX - startX, 50)
                          onResize?.(newWidth)
                        }
                        const onMouseUp = () => {
                          document.removeEventListener('mousemove', onMouseMove)
                          document.removeEventListener('mouseup', onMouseUp)
                        }
                        document.addEventListener('mousemove', onMouseMove)
                        document.addEventListener('mouseup', onMouseUp)
                      }}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 5,
                        cursor: 'col-resize',
                        backgroundColor: 'transparent',
                        zIndex: 1
                      }}
                    />
                  </th>
                )
              }
            }
          }}
          columns={[
            ...(visibleCols.includes('image') ? [{ title: '图片', key: 'image', width: 80, fixed: 'left' as const, render: (_: any, row: EquipmentItem) => {
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
            }}] : []),
            { title: '行号', key: 'rowNum', width: 60, fixed: 'left' as const, render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
            ...(visibleCols.includes('category') ? [{ title: '类别', dataIndex: 'category', key: 'category', width: 80, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.category, b.category), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('school_code') ? [{ title: '校内编号', dataIndex: 'school_code', key: 'school_code', width: 110, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.school_code, b.school_code), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('serial_number') ? [{ title: '设备序列号', dataIndex: 'serial_number', key: 'serial_number', width: 130, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.serial_number, b.serial_number), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('name') ? [{ title: '设备名称', dataIndex: 'name', key: 'name', width: 120, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.name, b.name), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('value') ? [{ title: '价值', dataIndex: 'value', key: 'value', width: 80, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.value, b.value), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('model') ? [{ title: '型号', dataIndex: 'model', key: 'model', width: 100, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.model, b.model), onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (value: any) => <span style={{ fontSize: '12px' }}>{value || '-'}</span> }] : []),
            ...(visibleCols.includes('teacher_name') ? [{ title: '领用导师', dataIndex: 'teacher_name', key: 'teacher_name', width: 90, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.teacher_name, b.teacher_name), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('student_school_id') ? [{ title: '使用学生学号', dataIndex: 'student_school_id', key: 'student_school_id', width: 110, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.student_school_id, b.student_school_id), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('student_name') ? [{ title: '使用学生姓名', dataIndex: 'student_name', key: 'student_name', width: 100, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.student_name, b.student_name), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('status') ? [{ title: '状态', key: 'status', width: 110, sorter: (a: EquipmentItem, b: EquipmentItem) => {
              const aStatus = getStatusText(a).text
              const bStatus = getStatusText(b).text
              return aStatus.localeCompare(bStatus)
            }, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (_: any, row: EquipmentItem) => {
              const status = getStatusText(row)
              return <Tag color={status.color}>{status.text}</Tag>
            } }] : []),
            ...(visibleCols.includes('location') ? [{ title: '存放地址', dataIndex: 'location', key: 'location', width: 120, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.location, b.location), onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (value: any) => <span style={{ fontSize: '12px' }}>{value || '-'}</span> }] : []),
            ...(visibleCols.includes('purchase_date') ? [{ title: '购置日期', dataIndex: 'purchase_date', key: 'purchase_date', width: 100, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.purchase_date, b.purchase_date), onCell: () => ({ style: { whiteSpace: 'nowrap' } }) }] : []),
            ...(visibleCols.includes('remark') ? [{ title: '备注', dataIndex: 'remark', key: 'remark', width: 120, sorter: (a: EquipmentItem, b: EquipmentItem) => strSort(a.remark, b.remark), ellipsis: true as const, onCell: () => ({ style: { whiteSpace: 'nowrap' } }), render: (value: any) => <span style={{ fontSize: '12px' }}>{value || '-'}</span> }] : []),
            {
              title: '操作',
              key: 'action',
              width: 140,
              fixed: 'right' as const,
              align: 'center',
              render: (_, row) => {
                const status = getStatusText(row)
                if (status.text === '可领用') {
                  return (
                    <ImportOutlined 
                      style={{ fontSize: 18, color: '#2563eb', cursor: 'pointer' }} 
                      onClick={() => handleBorrow(row)}
                      title="领用"
                    />
                  )
                }
                if (status.text === '我领用') {
                  return (
                    <Space size={8}>
                      <UploadOutlined 
                        style={{ fontSize: 18, color: '#2563eb', cursor: 'pointer' }} 
                        onClick={() => openImageModal(row)}
                        title="上传图片"
                      />
                      <ExportOutlined 
                        style={{ fontSize: 18, color: '#ff4d4f', cursor: 'pointer' }} 
                        onClick={() => handleReturn(row)}
                        title="归还"
                      />
                    </Space>
                  )
                }
                return null
              }
            }
          ]}
        />
      </Card>

      <Modal
        open={filterVisible}
        title="筛选条件"
        okText="应用筛选"
        cancelText="取消"
        onOk={handleApplyFilter}
        onCancel={() => setFilterVisible(false)}
        width={520}
        footer={[
          <Button key="clear" onClick={handleClearFilter}>
            清除筛选
          </Button>,
          <Button key="cancel" onClick={() => setFilterVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleApplyFilter}>
            应用筛选
          </Button>
        ]}
      >
        <Form form={form} layout="horizontal" labelCol={{ flex: '80px' }} wrapperCol={{ flex: 'auto' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Form.Item name="filterName" label="设备名称">
                <Input placeholder="请输入设备名称" allowClear />
              </Form.Item>
              <Form.Item name="filterCategory" label="类别">
                <Select placeholder="请选择类别" allowClear options={categoryOptions} />
              </Form.Item>
            </Space>
            <Space>
              <Form.Item name="filterStatus" label="状态">
                <Select placeholder="请选择状态" allowClear options={statusOptions} />
              </Form.Item>
              <Form.Item name="filterSchoolCode" label="校内编号">
                <Input placeholder="请输入校内编号" allowClear />
              </Form.Item>
            </Space>
            <Space>
              <Form.Item name="filterSerialNumber" label="设备序列号">
                <Input placeholder="请输入设备序列号" allowClear />
              </Form.Item>
              <Form.Item name="filterLocation" label="存放地址">
                <Input placeholder="请输入存放地址" allowClear />
              </Form.Item>
            </Space>
          </Space>
        </Form>
      </Modal>

      <Modal
        open={colSettingVisible}
        title="设置显示列"
        okText="确定"
        cancelText="取消"
        onOk={() => setColSettingVisible(false)}
        onCancel={() => setColSettingVisible(false)}
        width={480}
      >
        <Checkbox.Group
          value={visibleCols}
          onChange={vals => setVisibleCols(vals as string[])}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {allColumns.map(col => (
            <Checkbox key={col.key} value={col.key} style={{ width: 140 }}>
              {col.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      </Modal>

      <Modal
        open={!!imageModalEquipment}
        title={`设备图片 - ${imageModalEquipment?.name}`}
        okText="关闭"
        cancelText={null}
        onOk={() => setImageModalEquipment(null)}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {imageModalEquipment?.image_url && (
            <div>
              <Image
                width={180}
                height={180}
                src={imageModalEquipment.image_url}
                style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }}
              />
              <div style={{ marginTop: 8 }}>
                <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreviewImage(imageModalEquipment.image_url!)} style={{ marginRight: 8 }}>预览</Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteImage(imageModalEquipment!)}>删除图片</Button>
              </div>
            </div>
          )}
          <div>
            <Upload
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              showUploadList={false}
              beforeUpload={handleUploadImage}
              disabled={uploadingImage}
            >
              <Button icon={<UploadOutlined />} loading={uploadingImage}>
                {uploadingImage ? '上传中...' : imageModalEquipment?.image_url ? '更换图片' : '上传图片'}
              </Button>
            </Upload>
            <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
              支持 PNG、JPEG、WebP 和 GIF 格式，最大 10MB
            </div>
          </div>
        </Space>
      </Modal>

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