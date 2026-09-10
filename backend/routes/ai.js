/**
 * AI 路由 — 基于 LangChain 框架
 * - POST /chat         单提交对话（SSE 流式）
 * - GET/POST /history  对话历史管理
 * - GET /student/:studentId/submissions  学生周次提交列表
 * - POST /analyze-progress  多周进度分析（SSE 流式）
 * - GET/POST /analysis-history  分析历史管理
 */
const express = require('express')
const path = require('path')
const { getQuery, runQuery, allQuery } = require('../database')
const { authMiddleware } = require('../middleware/auth')
const { toPositiveInt } = require('../utils/sanitize')
const {
  chatStream,
  analyzeProgressStream,
  loadSubmissionAttachment
} = require('../services/langchain')

const router = express.Router()

router.use(authMiddleware)

// ==================== 工具函数 ====================

/**
 * 校验提交记录是否属于当前教师名下的任务（越权访问防护）。
 * 返回提交记录，无权限时返回 null。
 */
async function findOwnedSubmission(submissionId, teacherId) {
  const id = toPositiveInt(submissionId)
  if (!id) return null
  return getQuery(
    `SELECT s.id, s.task_id
     FROM submissions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ? AND t.teacher_id = ?`,
    [id, teacherId]
  )
}

function parseStoredFile(rawValue) {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (parsed && typeof parsed === 'object') {
      const url = parsed.url || parsed.path || ''
      if (url) return { name: parsed.name || path.basename(url), url }
    }
  } catch { /* legacy */ }
  const raw = String(rawValue).trim()
  if (!raw) return null
  if (raw.startsWith('/uploads/')) return { name: path.basename(raw), url: raw }
  return { name: raw, url: `/uploads/${raw}` }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '未知'
  try {
    const d = new Date(dateStr)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return dateStr
  }
}

const statusMap = { pending: '待审核', approved: '已通过', rejected: '未通过' }


/**
 * 构建单提交对话上下文
 */
async function buildContext(submissionId) {
  const submission = await getQuery(
    `SELECT s.*, u.student_id as student_school_id, u.username as student_name,
            u.student_grade, u.student_major,
            t.title as task_title, t.type as task_type, t.content as task_content
     FROM submissions s
     JOIN users u ON s.student_id = u.id
     JOIN tasks t ON s.task_id = t.id
     WHERE s.id = ?`,
    [submissionId]
  )

  if (!submission) {
    throw new Error('提交记录不存在')
  }

  const fileInfo = parseStoredFile(submission.submit_file)
  const attachment = await loadSubmissionAttachment(fileInfo)

  return {
    studentName: submission.student_name,
    studentSchoolId: submission.student_school_id,
    studentGrade: submission.student_grade,
    studentMajor: submission.student_major,
    taskTitle: submission.task_title,
    taskType: submission.task_type,
    taskContent: submission.task_content,
    submitContent: submission.submit_content,
    submitTime: formatDateTime(submission.submit_time),
    checkStatus: statusMap[submission.check_status] || '待审核',
    checkRemark: submission.check_remark || '',
    ...attachment
  }
}

// ==================== 单提交对话 ====================

router.post('/chat', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权访问' })
    }

    const { submissionId, messages } = req.body

    if (!submissionId) {
      return res.status(400).json({ error: '缺少 submissionId 参数' })
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '缺少 messages 参数' })
    }

    const owned = await findOwnedSubmission(submissionId, req.user.id)
    if (!owned) {
      return res.status(404).json({ error: '提交记录不存在或无权访问' })
    }

    const context = await buildContext(owned.id)

    // 过滤并标准化消息格式
    const validMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    // 加载历史消息（排除当前最新的一条用户消息）
    const teacherId = req.user.id
    const historyRow = await getQuery(
      'SELECT messages FROM ai_chat_history WHERE submission_id = ? AND teacher_id = ?',
      [submissionId, teacherId]
    )

    let historyMessages = []
    if (historyRow && historyRow.messages) {
      try {
        historyMessages = JSON.parse(historyRow.messages)
      } catch {
        historyMessages = []
      }
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    req.setTimeout(120000)
    res.setTimeout(120000)

    let streamAborted = false
    req.on('close', () => {
      streamAborted = true
      try { res.end() } catch { /* ignore */ }
    })

    try {
      for await (const token of chatStream(context, validMessages, historyMessages)) {
        if (streamAborted) break
        res.write(`data: ${JSON.stringify({ token })}\n\n`)
        if (res.flush) res.flush()
      }
    } catch (streamErr) {
      if (!streamAborted) {
        res.write(`data: ${JSON.stringify({ error: '流式响应失败: ' + streamErr.message })}\n\n`)
      }
    }

    if (!streamAborted) {
      res.write('data: [DONE]\n\n')
    }
    res.end()
  } catch (err) {
    console.error('AI对话错误:', err)
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ error: 'AI服务请求失败: ' + (err.message || '未知错误') })}\n\n`)
        res.end()
      } catch { /* ignore */ }
    } else {
      if (err.message === '提交记录不存在') {
        return res.status(404).json({ error: err.message })
      }
      res.status(500).json({ error: 'AI服务请求失败: ' + (err.message || '未知错误') })
    }
  }
})

// ==================== 对话历史 ====================

router.get('/history/:submissionId', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权访问' })
    }

    const { submissionId } = req.params
    const teacherId = req.user.id

    const owned = await findOwnedSubmission(submissionId, teacherId)
    if (!owned) {
      return res.status(404).json({ error: '提交记录不存在或无权访问' })
    }

    const row = await getQuery(
      'SELECT messages FROM ai_chat_history WHERE submission_id = ? AND teacher_id = ?',
      [submissionId, teacherId]
    )

    let messages = []
    if (row && row.messages) {
      try {
        messages = JSON.parse(row.messages)
      } catch {
        messages = []
      }
    }

    res.json({ success: true, data: { messages } })
  } catch (err) {
    console.error('加载对话历史失败:', err)
    res.status(500).json({ error: '加载对话历史失败' })
  }
})

router.post('/history/:submissionId', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权访问' })
    }

    const { submissionId } = req.params
    const { messages } = req.body
    const teacherId = req.user.id

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages 必须是数组' })
    }

    const owned = await findOwnedSubmission(submissionId, teacherId)
    if (!owned) {
      return res.status(404).json({ error: '提交记录不存在或无权访问' })
    }

    const existing = await getQuery(
      'SELECT id FROM ai_chat_history WHERE submission_id = ? AND teacher_id = ?',
      [submissionId, teacherId]
    )

    const messagesJson = JSON.stringify(messages)

    if (existing) {
      await runQuery(
        'UPDATE ai_chat_history SET messages = ?, update_time = CURRENT_TIMESTAMP WHERE submission_id = ? AND teacher_id = ?',
        [messagesJson, submissionId, teacherId]
      )
    } else {
      await runQuery(
        'INSERT INTO ai_chat_history (submission_id, teacher_id, messages) VALUES (?, ?, ?)',
        [submissionId, teacherId, messagesJson]
      )
    }

    res.json({ success: true })
  } catch (err) {
    console.error('保存对话历史失败:', err)
    res.status(500).json({ error: '保存对话历史失败' })
  }
})

// ==================== 学生周次提交列表（多周分析用） ====================

router.get('/student/:studentId/submissions', async (req, res) => {
  try {
    const { studentId } = req.params
    const teacherId = req.user.id

    // 仅教师可访问
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权访问' })
    }

    const studentIdNum = toPositiveInt(studentId)
    if (!studentIdNum) {
      return res.status(400).json({ error: '学生ID不合法' })
    }

    const submissions = await allQuery(
      `SELECT s.id as submission_id, s.week_number, s.submit_time, s.submit_file,
              s.task_id, t.title as task_title,
              u.username as student_name, u.student_id as student_school_id
       FROM submissions s
       JOIN tasks t ON s.task_id = t.id
       JOIN users u ON s.student_id = u.id
       WHERE t.teacher_id = ? AND s.student_id = ?
       ORDER BY s.week_number ASC, s.submit_time DESC`,
      [teacherId, studentIdNum]
    )

    // 解析文件信息，按周去重（同一周取最新提交）
    const weekMap = new Map()
    for (const sub of submissions) {
      const fileInfo = parseStoredFile(sub.submit_file)
      const weekKey = `${sub.task_id}-${sub.week_number}`

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, {
          submission_id: sub.submission_id,
          task_id: sub.task_id,
          task_title: sub.task_title,
          week_number: sub.week_number,
          submit_time: formatDateTime(sub.submit_time),
          file_name: fileInfo?.name || '',
          file_url: fileInfo?.url || '',
          is_pdf: fileInfo?.url ? fileInfo.url.toLowerCase().endsWith('.pdf') : false,
          student_name: sub.student_name,
          student_school_id: sub.student_school_id
        })
      }
    }

    const result = Array.from(weekMap.values())

    res.json({
      success: true,
      data: result
    })
  } catch (err) {
    console.error('获取学生提交列表失败:', err)
    res.status(500).json({ error: '获取学生提交列表失败' })
  }
})

// ==================== 多周进度分析 ====================

router.post('/analyze-progress', async (req, res) => {
  try {
    const { studentId, submissionIds, taskId } = req.body
    const teacherId = req.user.id

    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' })
    }

    if (!studentId || !submissionIds || !Array.isArray(submissionIds) || submissionIds.length < 2) {
      return res.status(400).json({ error: '请选择至少 2 个周次的提交进行对比分析' })
    }

    if (!taskId) {
      return res.status(400).json({ error: '缺少 taskId 参数' })
    }

    // 查询学生信息
    const student = await getQuery(
      'SELECT id, username as student_name, student_id as student_school_id FROM users WHERE id = ?',
      [studentId]
    )

    if (!student) {
      return res.status(404).json({ error: '学生不存在' })
    }

    // 查询任务信息
    const task = await getQuery(
      'SELECT id, title FROM tasks WHERE id = ? AND teacher_id = ?',
      [taskId, teacherId]
    )

    if (!task) {
      return res.status(404).json({ error: '任务不存在或无权访问' })
    }

    // 查询所有选中提交的详细信息
    const placeholders = submissionIds.map(() => '?').join(',')
    const submissions = await allQuery(
      `SELECT s.id as submission_id, s.week_number, s.submit_time, s.submit_file
       FROM submissions s
       WHERE s.id IN (${placeholders}) AND s.student_id = ? AND s.task_id = ?
       ORDER BY s.week_number ASC`,
      [...submissionIds, studentId, taskId]
    )

    if (submissions.length < 2) {
      return res.status(400).json({ error: '选中的有效提交不足 2 个' })
    }

    // 构建 PDF 列表
    const pdfs = submissions.map(sub => {
      const fileInfo = parseStoredFile(sub.submit_file)
      return {
        submissionId: sub.submission_id,
        fileUrl: fileInfo?.url || '',
        fileName: fileInfo?.name || '',
        weekNumber: sub.week_number,
        submitTime: formatDateTime(sub.submit_time)
      }
    }).filter(p => p.fileUrl && p.fileUrl.toLowerCase().endsWith('.pdf'))

    if (pdfs.length < 2) {
      return res.status(400).json({ error: '选中的提交中 PDF 文件不足 2 个，无法进行分析' })
    }

    // 构建分析上下文
    const analysisContext = {
      studentName: student.student_name,
      studentSchoolId: student.student_school_id,
      taskTitle: task.title,
      weeks: pdfs.map(p => ({
        weekNumber: p.weekNumber,
        submitTime: p.submitTime,
        fileName: p.fileName
      }))
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    req.setTimeout(300000) // 分析可能较慢，给 5 分钟
    res.setTimeout(300000)

    let streamAborted = false
    req.on('close', () => {
      streamAborted = true
      try { res.end() } catch { /* ignore */ }
    })

    // 收集完整结果用于保存
    let fullResult = ''

    try {
      for await (const token of analyzeProgressStream(analysisContext, pdfs)) {
        if (streamAborted) break
        fullResult += token
        res.write(`data: ${JSON.stringify({ token })}\n\n`)
        if (res.flush) res.flush()
      }
    } catch (streamErr) {
      console.error('分析流失败:', streamErr)
      if (!streamAborted) {
        res.write(`data: ${JSON.stringify({ error: '分析失败: ' + streamErr.message })}\n\n`)
      }
    }

    if (!streamAborted) {
      // 保存分析历史
      try {
        await runQuery(
          `INSERT INTO ai_analysis_history (teacher_id, student_id, task_id, submission_ids, result)
           VALUES (?, ?, ?, ?, ?)`,
          [teacherId, studentId, taskId, JSON.stringify(submissionIds), fullResult]
        )
      } catch (saveErr) {
        console.error('保存分析历史失败:', saveErr)
      }

      res.write('data: [DONE]\n\n')
    }
    res.end()
  } catch (err) {
    console.error('进度分析错误:', err)
    if (res.headersSent) {
      try {
        res.write(`data: ${JSON.stringify({ error: '分析请求失败: ' + (err.message || '未知错误') })}\n\n`)
        res.end()
      } catch { /* ignore */ }
    } else {
      res.status(500).json({ error: '分析请求失败: ' + (err.message || '未知错误') })
    }
  }
})

// ==================== 分析历史 ====================

router.get('/analysis-history', async (req, res) => {
  try {
    const teacherId = req.user.id

    const records = await allQuery(
      `SELECT h.*, u.username as student_name, u.student_id as student_school_id,
              t.title as task_title
       FROM ai_analysis_history h
       JOIN users u ON h.student_id = u.id
       JOIN tasks t ON h.task_id = t.id
       WHERE h.teacher_id = ?
       ORDER BY h.create_time DESC
       LIMIT 50`,
      [teacherId]
    )

    const result = records.map(r => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      student_school_id: r.student_school_id,
      task_id: r.task_id,
      task_title: r.task_title,
      submission_ids: (() => {
        try { return JSON.parse(r.submission_ids) } catch { return [] }
      })(),
      result: r.result,
      create_time: formatDateTime(r.create_time)
    }))

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('加载分析历史失败:', err)
    res.status(500).json({ error: '加载分析历史失败' })
  }
})

router.get('/analysis-history/:id', async (req, res) => {
  try {
    const teacherId = req.user.id
    const { id } = req.params

    const record = await getQuery(
      `SELECT h.*, u.username as student_name, u.student_id as student_school_id,
              t.title as task_title
       FROM ai_analysis_history h
       JOIN users u ON h.student_id = u.id
       JOIN tasks t ON h.task_id = t.id
       WHERE h.id = ? AND h.teacher_id = ?`,
      [id, teacherId]
    )

    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    res.json({
      success: true,
      data: {
        id: record.id,
        student_id: record.student_id,
        student_name: record.student_name,
        student_school_id: record.student_school_id,
        task_id: record.task_id,
        task_title: record.task_title,
        submission_ids: (() => {
          try { return JSON.parse(record.submission_ids) } catch { return [] }
        })(),
        result: record.result,
        create_time: formatDateTime(record.create_time)
      }
    })
  } catch (err) {
    console.error('加载分析详情失败:', err)
    res.status(500).json({ error: '加载分析详情失败' })
  }
})

module.exports = router
