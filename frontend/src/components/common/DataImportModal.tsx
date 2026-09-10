import { useState, useCallback, useMemo, useEffect } from 'react'
import { Modal, Card, Button, Select, Table, Upload, message, Input, Tag, Alert, Space } from 'antd'
import { UploadOutlined, EyeOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { dataManageApi } from '@/api'
import type { TableConfig, ParsedExcel, ImportResult, ImportPreviewResult } from '@/api'

interface DataImportModalProps {
  open: boolean
  onCancel: () => void
  onSuccess: () => void
  tableKey: string
  tableLabel: string
}

/**
 * Excel 导入向导（选文件 → 列映射 → 预览 → 执行）。
 * 学生名单在学生管理页调用，设备在设备管理页调用。
 */
export default function DataImportModal({ open, onCancel, onSuccess, tableKey, tableLabel }: DataImportModalProps) {
  const [tables, setTables] = useState<TableConfig[]>([])
  const [parsedExcel, setParsedExcel] = useState<ParsedExcel | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [strategy, setStrategy] = useState<'delete_append' | 'update'>('update')
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [defaultValues, setDefaultValues] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [resultVisible, setResultVisible] = useState(false)

  const currentTable = useMemo(() => tables.find(t => t.key === tableKey), [tables, tableKey])

  const resetState = useCallback(() => {
    setParsedExcel(null)
    setColumnMapping({})
    setImportPreview(null)
    setDefaultValues({})
    setImportResult(null)
    setPreviewVisible(false)
    setResultVisible(false)
  }, [])

  useEffect(() => {
    if (!open) return
    resetState()
    dataManageApi.getTables()
      .then(res => setTables(res.data))
      .catch(() => message.error('获取数据表信息失败'))
  }, [open, resetState])

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const res = await dataManageApi.parseExcel(file)
      setParsedExcel(res.data)
      const initialMapping: Record<string, string> = {}
      if (currentTable) {
        for (const col of currentTable.columns) {
          if (col.pk) continue
          const match = res.data.headers.find((h: string) => h === col.label || h === col.name || h.toLowerCase().includes(col.label.toLowerCase()) || h.toLowerCase().includes(col.name.toLowerCase()))
          if (match) initialMapping[col.name] = match
        }
      }
      setColumnMapping(initialMapping)
      setImportPreview(null)
      message.success(`解析成功，共 ${res.data.totalRows} 行数据`)
    } catch (error: any) { message.error(error.response?.data?.error || '解析Excel文件失败') }
    finally { setUploading(false) }
    return false
  }, [currentTable])

  const handlePreviewImport = useCallback(async () => {
    if (!parsedExcel || !currentTable) return

    const hasMapping = Object.values(columnMapping).some(v => v)
    if (!hasMapping) { message.warning('请至少映射一列'); return }

    const missingFields = currentTable.columns.filter(c => !c.pk && !c.nullable && !columnMapping[c.name] && !defaultValues[c.name]).map(c => c.label)
    if (missingFields.length > 0) { message.error(`以下必填字段未映射列也未填写缺省值：${missingFields.join('、')}`); return }

    setPreviewing(true)
    try {
      const res = await dataManageApi.previewImport({ tableKey, fileId: parsedExcel.fileId, columnMapping, strategy, defaultValues })
      setImportPreview(res.data)
      setPreviewVisible(true)
    } catch (error: any) {
      message.error(error.response?.data?.error || '预览导入失败')
    }
    finally { setPreviewing(false) }
  }, [tableKey, parsedExcel, columnMapping, strategy, defaultValues, currentTable])

  const handleExecuteImport = useCallback(async () => {
    if (!parsedExcel) return
    setImporting(true)
    try {
      const res = await dataManageApi.confirmImport({ tableKey, fileId: parsedExcel.fileId, columnMapping, strategy, defaultValues })
      setImportResult(res.data)
      setResultVisible(true)
      setPreviewVisible(false)
    } catch (error: any) { message.error(error.response?.data?.error || '导入失败') }
    finally { setImporting(false) }
  }, [tableKey, parsedExcel, columnMapping, strategy, defaultValues])

  const handleExportFailedRecords = useCallback(() => {
    if (!importResult || importResult.failedRecords.length === 0) return
    const headers = Object.keys(importResult.failedRecords[0].data)
    const wsData = [['行号', ...headers, '失败原因'], ...importResult.failedRecords.map(r => [r.rowIndex, ...headers.map(h => r.data[h] ?? ''), r.reason])]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '失败记录')
    XLSX.writeFile(wb, `导入失败记录_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`)
  }, [importResult])

  const getStatusTag = (status: string) => {
    if (status === 'new') return <Tag color="success">新增</Tag>
    if (status === 'update') return <Tag color="blue">更新</Tag>
    if (status === 'replace') return <Tag color="orange">替换</Tag>
    if (status === 'skip') return <Tag color="warning">跳过</Tag>
    return <Tag>{status}</Tag>
  }

  return (
    <>
      <Modal
        title={`导入${tableLabel}`}
        open={open}
        onCancel={() => { resetState(); onCancel() }}
        width={1000}
        footer={null}
      >
        <Card title="第一步：选择导入文件" style={{ marginBottom: 16 }}>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={handleFileUpload} disabled={uploading || !currentTable}>
            <Button icon={<UploadOutlined />} loading={uploading} disabled={!currentTable}>选择Excel文件</Button>
          </Upload>
          {!currentTable && (
            <div style={{ marginTop: 12, color: 'var(--text-tertiary)', fontSize: 13 }}>正在加载导入配置...</div>
          )}
          {parsedExcel && (
            <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              工作表：{parsedExcel.sheetName} | 列数：{parsedExcel.headers.length} | 数据行数：{parsedExcel.totalRows}
            </div>
          )}
        </Card>

        {parsedExcel && currentTable && (
          <>
            <Card title="第二步：列映射（左侧：目标数据库字段，右侧：Excel列）" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: 8 }}>目标数据库结构</h4>
                  <Table
                    dataSource={currentTable.columns}
                    rowKey="name" size="small" pagination={false}
                    columns={[
                      { title: '字段名', dataIndex: 'name', width: 120, render: (v: string, r: any) => r.pk ? <span style={{ color: '#f5222d', fontWeight: 600 }}>{v} ★</span> : v },
                      { title: '中文名', dataIndex: 'label', width: 100 },
                      { title: '类型', dataIndex: 'type', width: 70 },
                      { title: '长度', dataIndex: 'length', width: 60, render: (v: string) => v || '-' },
                      { title: '允许空', dataIndex: 'nullable', width: 60, render: (v: boolean) => v ? '是' : <span style={{ color: '#f5222d' }}>否</span> },
                      { title: '主键', dataIndex: 'pk', width: 50, render: (v: boolean) => v ? <span style={{ color: '#f5222d', fontWeight: 600 }}>是</span> : '否' }
                    ]}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: 8 }}>待导入数据结构</h4>
                  <Table
                    dataSource={parsedExcel.headers.map((h, i) => ({ key: h, index: i + 1, name: h, sample: parsedExcel.preview.slice(0, 3).map(r => r[h]).join(' / ') }))}
                    rowKey="key" size="small" pagination={false}
                    columns={[
                      { title: '序号', dataIndex: 'index', width: 50 },
                      { title: '列名', dataIndex: 'name', width: 120 },
                      { title: '示例数据', dataIndex: 'sample', ellipsis: true }
                    ]}
                  />
                </div>
              </div>
            </Card>

            <Card title="第三步：设置映射关系" style={{ marginBottom: 16 }}>
              {currentTable.columns.filter(c => !c.pk).map(col => (
                <div key={col.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 120, fontWeight: 500 }}>
                    {col.label}{!col.nullable && <span style={{ color: '#f5222d' }}>*</span>}:
                  </span>
                  <Select
                    allowClear
                    placeholder="选择Excel列（留空则使用缺省值）"
                    value={columnMapping[col.name]}
                    onChange={val => setColumnMapping(prev => ({ ...prev, [col.name]: val || '' }))}
                    style={{ width: 200 }}
                    options={parsedExcel.headers.map(h => ({ value: h, label: h }))}
                  />
                  {!columnMapping[col.name] && (
                    <Input
                      placeholder={`缺省值`}
                      value={defaultValues[col.name] || ''}
                      onChange={e => setDefaultValues(prev => ({ ...prev, [col.name]: e.target.value }))}
                      style={{ width: 160 }}
                    />
                  )}
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <span style={{ marginRight: 8 }}>导入策略：</span>
                <Select value={strategy} onChange={setStrategy} style={{ width: 200 }} options={[
                  { value: 'update', label: '有则更新，无则插入' },
                  { value: 'delete_append', label: '先删后加（全量替换）' }
                ]} />
              </div>
            </Card>

            <Space>
              <Button type="primary" icon={<EyeOutlined />} loading={previewing} onClick={handlePreviewImport}>预览导入</Button>
              <Button onClick={() => { resetState(); onCancel() }}>取消</Button>
            </Space>
          </>
        )}
      </Modal>

      <Modal
        title="导入预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={1000}
        footer={[
          <Button key="cancel" onClick={() => setPreviewVisible(false)}>取消</Button>,
          <Button key="import" type="primary" loading={importing} onClick={handleExecuteImport}>确认导入</Button>
        ]}
      >
        {importPreview && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div><strong>总计：</strong>{importPreview.totalRows} 行</div>
              <div style={{ color: '#52c41a' }}><strong>新增：</strong>{importPreview.newCount} 行</div>
              <div style={{ color: '#1890ff' }}><strong>更新：</strong>{importPreview.updateCount} 行</div>
              <div style={{ color: '#faad14' }}><strong>跳过：</strong>{importPreview.skipCount} 行</div>
              {importPreview.conflictCount > 0 && <div style={{ color: '#f5222d' }}><strong>冲突：</strong>{importPreview.conflictCount} 条</div>}
            </div>

            {importPreview.conflicts && importPreview.conflicts.length > 0 && (
              <Alert
                message="冲突提醒"
                description={
                  <ul style={{ margin: 0 }}>
                    {importPreview.conflicts.slice(0, 5).map((c, i) => (
                      <li key={i}>行 {c.row}: {c.message}</li>
                    ))}
                    {importPreview.conflicts.length > 5 && <li>... 还有 {importPreview.conflicts.length - 5} 条</li>}
                  </ul>
                }
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Card title="预览数据（前50行）" size="small">
              <Table
                dataSource={importPreview.previewRows}
                rowKey="_rowIndex"
                size="small"
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: '行号', dataIndex: '_rowIndex', width: 60, fixed: 'left' },
                  { title: '状态', dataIndex: '_status', width: 80, fixed: 'left', render: (status: string) => getStatusTag(status) },
                  ...(importPreview.columns || []).map((col) => ({
                    title: col.label,
                    dataIndex: col.name,
                    width: col.name.length > 8 ? 120 : 100,
                    ellipsis: true
                  }))
                ]}
                scroll={{ x: 'max-content' }}
              />
            </Card>
          </div>
        )}
      </Modal>

      <Modal title="导入结果" open={resultVisible} onCancel={() => { resetState(); onSuccess() }} footer={null} width={600}>
        {importResult && (
          <div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div><strong>总计：</strong>{importResult.totalRows} 行</div>
              <div style={{ color: '#52c41a' }}><strong>新增：</strong>{importResult.insertedCount} 行</div>
              <div style={{ color: '#1890ff' }}><strong>更新：</strong>{importResult.updatedCount} 行</div>
              {importResult.deletedCount > 0 && <div style={{ color: '#faad14' }}><strong>删除：</strong>{importResult.deletedCount} 行</div>}
              {importResult.skippedCount > 0 && <div style={{ color: '#f5222d' }}><strong>跳过：</strong>{importResult.skippedCount} 行</div>}
            </div>
            {importResult.failedRecords.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ color: '#f5222d' }}>失败 {importResult.failedRecords.length} 条</span>
                  <Button size="small" onClick={handleExportFailedRecords}>导出失败记录</Button>
                </div>
                <Table dataSource={importResult.failedRecords} rowKey="rowIndex" size="small" columns={[
                  { title: '行号', dataIndex: 'rowIndex', width: 60 },
                  { title: '失败原因', dataIndex: 'reason', ellipsis: true }
                ]} />
              </div>
            )}
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Button type="primary" onClick={() => { resetState(); onSuccess() }}>确定</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
