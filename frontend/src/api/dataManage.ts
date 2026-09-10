import api from './axios'

/** 与 backend/routes/data-manage.js 的 GET /tables 返回结构一致 */
export interface TableConfig {
  key: string
  label: string
  columns: Array<{
    name: string
    label: string
    type: string
    length?: string
    nullable: boolean
    pk: boolean
    defaultValue?: string
  }>
  uniqueColumns: Array<{ column: string; label: string }>
}

/** 与 backend/routes/data-manage.js 的 POST /parse 返回结构一致 */
export interface ParsedExcel {
  fileId: string
  sheetName: string
  headers: string[]
  totalRows: number
  preview: Array<Record<string, string>>
}

/** 与 backend/routes/data-manage.js 的 /execute-import 返回结构一致 */
export interface ImportResult {
  success: boolean
  message: string
  insertedCount: number
  updatedCount: number
  deletedCount: number
  skippedCount: number
  failedRecords: Array<{ rowIndex: number; data: Record<string, string>; reason: string }>
  totalRows: number
}

export interface ImportPreviewResult {
  totalRows: number
  newCount: number
  updateCount: number
  skipCount: number
  conflictCount: number
  conflicts: Array<{ row: number; key?: string; message: string }>
  previewRows: Array<Record<string, any>>
  columns: TableConfig['columns']
}

export interface ImportPayload {
  tableKey: string
  fileId: string
  columnMapping: Record<string, string>
  strategy: 'delete_append' | 'update'
  defaultValues: Record<string, string>
}

/**
 * Excel 导入 / 导出（学生名单、实验设备）共用接口。
 * 导入入口分别位于「学生管理」和「设备管理」页面（DataImportModal）。
 */
export const dataManageApi = {
  getTables: () => api.get<TableConfig[]>('/data-manage/tables'),
  parseExcel: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<ParsedExcel>('/data-manage/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  previewImport: (data: ImportPayload) =>
    api.post<ImportPreviewResult>('/data-manage/preview-import', data),
  confirmImport: (data: ImportPayload) =>
    api.post<ImportResult>('/data-manage/execute-import', data, { timeout: 300000 }),
  exportTable: (tableKey: string) =>
    api.get(`/data-manage/export/${tableKey}`, { responseType: 'blob' })
}
