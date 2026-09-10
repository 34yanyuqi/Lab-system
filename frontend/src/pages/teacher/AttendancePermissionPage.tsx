import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Modal, Select, Checkbox, Space, message, Tag, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '@/api/axios'
import { attendanceApi } from '@/api/attendance'
import type { AttendancePermission } from '@/types'

export default function TeacherAttendancePermissionPage() {
  const [permissions, setPermissions] = useState<AttendancePermission[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [students, setStudents] = useState<{ id: number; username: string; student_id: string }[]>([])
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null)
  const [canUpload, setCanUpload] = useState(true)
  const [canEdit, setCanEdit] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await attendanceApi.getPermissions()
      setPermissions(res.data.data || [])
    } catch {
      message.error('获取权限列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPermissions() }, [fetchPermissions])

  const openAddModal = async () => {
    try {
      const res = await api.get('/users/students')
      setStudents(res.data || [])
      setModalOpen(true)
    } catch {
      message.error('获取学生列表失败')
    }
  }

  const handleGrant = async () => {
    if (!selectedStudent) return
    setSaving(true)
    try {
      await attendanceApi.grantPermission(selectedStudent, canUpload, canEdit)
      message.success('授权成功')
      setModalOpen(false)
      setSelectedStudent(null)
      setCanUpload(true)
      setCanEdit(true)
      fetchPermissions()
    } catch (err: any) {
      message.error(err.response?.data?.message || '授权失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async (studentId: number) => {
    try {
      await attendanceApi.revokePermission(studentId)
      message.success('已撤销权限')
      fetchPermissions()
    } catch (err: any) {
      message.error(err.response?.data?.message || '撤销失败')
    }
  }

  const columns: ColumnsType<AttendancePermission> = [
    { title: '姓名', dataIndex: 'student_username', key: 'student_username' },
    {
      title: '专业', dataIndex: 'student_major', key: 'student_major',
      render: (v: string) => v || '未填写'
    },
    {
      title: '上传权限', dataIndex: 'can_upload', key: 'can_upload', align: 'center',
      render: (v: number) => v === 1 ? <Tag color="blue">有</Tag> : <Tag color="default">无</Tag>
    },
    {
      title: '编辑权限', dataIndex: 'can_edit', key: 'can_edit', align: 'center',
      render: (v: number) => v === 1 ? <Tag color="green">有</Tag> : <Tag color="default">无</Tag>
    },
    {
      title: '授权时间', dataIndex: 'created_at', key: 'created_at', width: 170,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作', key: 'action', width: 100, align: 'center',
      render: (_: unknown, record: AttendancePermission) => (
        <Popconfirm
          title="确定撤销该学生的考勤权限？"
          onConfirm={() => handleRevoke(record.student_id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger icon={<DeleteOutlined />}>撤销</Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <div className="page-shell">
      <Card
        title="考勤权限管理"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>添加权限</Button>}
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={permissions}
          columns={columns}
          pagination={{ pageSize: 15 }}
          size="small"
        />
      </Card>

      <Modal
        title="添加考勤权限"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setSelectedStudent(null) }}
        onOk={handleGrant}
        confirmLoading={saving}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>选择学生</label>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="搜索学生姓名"
              value={selectedStudent}
              onChange={setSelectedStudent}
              optionFilterProp="label"
              options={students.map(s => ({
                value: s.id,
                label: `${s.username}（学号：${s.student_id || '无'}）`
              }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>权限设置</label>
            <Space direction="vertical">
              <Checkbox checked={canUpload} onChange={e => setCanUpload(e.target.checked)}>
                允许上传Excel
              </Checkbox>
              <Checkbox checked={canEdit} onChange={e => setCanEdit(e.target.checked)}>
                允许修改考勤明细
              </Checkbox>
            </Space>
          </div>
        </div>
      </Modal>
    </div>
  )
}
