import api from './axios'

export interface Submission {
  id: number
  task_id: number
  student_id: number
  submit_content: string
  submit_file: string
  submit_time: string
  check_status: string
  check_remark: string
  check_time: string
  week_number: number
}

export interface SubmitTaskPayload {
  task_id: number
  submit_content?: string
  week_number?: number
  /** 重新提交时保留原有附件 */
  keep_existing_file?: boolean
  /** 新的附件（与后端 upload.single('submit_file') 对应） */
  submit_file?: File | null
}

export const submissionApi = {
  /** 不传 taskId 时返回当前身份可见的全部提交 */
  getSubmissions: (taskId?: number) =>
    taskId
      ? api.get<Submission[]>(`/submissions/task/${taskId}`)
      : api.get<Submission[]>('/submissions'),
  submitTask: (data: SubmitTaskPayload) => {
    const formData = new FormData()
    formData.append('task_id', String(data.task_id))
    if (data.submit_content !== undefined) formData.append('submit_content', data.submit_content)
    if (data.week_number !== undefined) formData.append('week_number', String(data.week_number))
    if (data.keep_existing_file) formData.append('keep_existing_file', 'true')
    if (data.submit_file) formData.append('submit_file', data.submit_file)
    return api.post<Submission>('/submissions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  reviewSubmission: (id: number, data: { check_status: string; check_remark?: string }) =>
    api.put<Submission>(`/submissions/${id}/review`, data),
  batchReview: (data: { submission_ids: number[]; check_status: string; check_remark?: string }) =>
    api.post('/submissions/batch-review', data),
  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('content_image', file)
    return api.post<{ url: string; name?: string }>('/submissions/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
