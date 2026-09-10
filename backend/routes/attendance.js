const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const { runQuery, getQuery, allQuery, db } = require('../database')
const { authMiddleware } = require('../middleware/auth')
const { success, badRequest, forbidden, notFound, error } = require('../utils/response')
const { isValidMonthString } = require('../utils/sanitize')
const config = require('../config')
const logger = require('../utils/logger')

const router = express.Router()
router.use(authMiddleware)

const uploadDir = path.join(__dirname, '..', 'uploads', 'attendance')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`
      cb(null, uniqueName)
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('只支持Excel文件格式'))
    }
  }
})

const attCfg = config.attendance

// ==================== 常量定义 ====================
const ANOMALY_COLORS = {
  late: '#1677ff',
  absent: '#ff4d4f'
}

const PUNCH_TIMES = {
  morningOn: '09:00',
  morningOff: '12:00',
  afternoonOn: '14:00',
  afternoonOff: '18:00'
}

// ==================== 业务逻辑工具函数 ====================

function calculatePunchResult(time, deadline, type) {
  if (!time || time === '') return '缺卡'
  if (type === 'on') {
    return time > deadline ? '迟到' : '正常'
  } else {
    return time < deadline ? '早退' : '正常'
  }
}

function getDayStatus(record) {
  const mOn = record.morning_on_time || ''
  const mOff = record.morning_off_time || ''
  const aOn = record.afternoon_on_time || ''
  const aOff = record.afternoon_off_time || ''

  if (mOn === '' && mOff === '' && aOn === '' && aOff === '') return '旷工'

  const mOnR = calculatePunchResult(mOn, attCfg.morningOnDeadline, 'on')
  const mOffR = calculatePunchResult(mOff, attCfg.morningOffEarliest, 'off')
  const aOnR = calculatePunchResult(aOn, attCfg.afternoonOnDeadline, 'on')
  const aOffR = calculatePunchResult(aOff, attCfg.afternoonOffEarliest, 'off')

  const onResults = [mOnR, aOnR]
  const allResults = [mOnR, mOffR, aOnR, aOffR]
  const hasOnMissing = onResults.includes('缺卡')
  const hasLate = allResults.includes('迟到')
  const hasEarly = allResults.includes('早退')

  if (hasLate) return '迟到'
  if (hasEarly) return '早退'
  if (hasOnMissing) return '缺卡'
  return '正常'
}

function attachResults(record) {
  return {
    ...record,
    morning_on_result: calculatePunchResult(record.morning_on_time || '', attCfg.morningOnDeadline, 'on'),
    morning_off_result: calculatePunchResult(record.morning_off_time || '', attCfg.morningOffEarliest, 'off'),
    afternoon_on_result: calculatePunchResult(record.afternoon_on_time || '', attCfg.afternoonOnDeadline, 'on'),
    afternoon_off_result: calculatePunchResult(record.afternoon_off_time || '', attCfg.afternoonOffEarliest, 'off'),
    day_status: getDayStatus(record)
  }
}

function countAbnormalPunches(record) {
  const results = [
    calculatePunchResult(record.morning_on_time || '', attCfg.morningOnDeadline, 'on'),
    calculatePunchResult(record.morning_off_time || '', attCfg.morningOffEarliest, 'off'),
    calculatePunchResult(record.afternoon_on_time || '', attCfg.afternoonOnDeadline, 'on'),
    calculatePunchResult(record.afternoon_off_time || '', attCfg.afternoonOffEarliest, 'off')
  ]
  return results.filter(r => r !== '正常').length
}

function getDefaultMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 归一化打卡时间为 HH:MM。
 * Excel 中的时间单元格可能是「一天的比例」数字（如 0.375）或 Date 对象，
 * 直接 String() 会得到 "0.375"，导致迟到/早退判断和展示全部出错。
 */
function normalizePunchTime(value) {
  if (value === undefined || value === null || value === '') return ''

  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60)
    const hours = Math.floor(totalMinutes / 60) % 24
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const raw = String(value).trim()
  if (!raw) return ''

  const match = raw.match(/(\d{1,2}):(\d{2})/)
  if (match) {
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${match[2]}`
    }
  }

  return raw
}

// ==================== 数据库操作辅助函数 ====================

async function checkAttendancePermission(user, requiredPermission) {
  if (user.role === 'teacher') return { allowed: true }
  const perm = await getQuery(
    'SELECT * FROM attendance_permissions WHERE student_id = ?',
    [user.id]
  )
  if (!perm) return { allowed: false, reason: '未授权' }
  if (requiredPermission === 'upload' && perm.can_upload !== 1) return { allowed: false, reason: '无上传权限' }
  if (requiredPermission === 'edit' && perm.can_edit !== 1) return { allowed: false, reason: '无编辑权限' }
  return { allowed: true }
}

/**
 * 判断当前用户是否可以查看其他学生的考勤。
 * 教师与获得考勤上传/编辑授权的学生（数据管理角色）可以查看。
 */
async function canViewOthersAttendance(user) {
  if (user.role === 'teacher') return true
  const [uploadPerm, editPerm] = await Promise.all([
    checkAttendancePermission(user, 'upload'),
    checkAttendancePermission(user, 'edit')
  ])
  return uploadPerm.allowed || editPerm.allowed
}

async function getAttendanceRows(monthPrefix, options = {}) {
  const { grade, name, userRole, username } = options
  
  if (userRole === 'teacher') {
    if (name) {
      return allQuery(
        'SELECT * FROM attendance_records WHERE name = ? AND work_date LIKE ? ORDER BY work_date',
        [name, monthPrefix]
      )
    }
    if (grade) {
      return allQuery(
        `SELECT ar.*, u.student_grade, u.student_major
         FROM attendance_records ar
         LEFT JOIN users u ON ar.name = u.username
         WHERE ar.work_date LIKE ? AND u.student_grade = ?
         ORDER BY ar.work_date, ar.name`,
        [monthPrefix, grade]
      )
    }
    return allQuery(
      `SELECT ar.*, u.student_grade, u.student_major
       FROM attendance_records ar
       LEFT JOIN users u ON ar.name = u.username
       WHERE ar.work_date LIKE ?
       ORDER BY ar.work_date, ar.name`,
      [monthPrefix]
    )
  } else {
    return allQuery(
      'SELECT * FROM attendance_records WHERE name = ? AND work_date LIKE ? ORDER BY work_date',
      [username, monthPrefix]
    )
  }
}

async function insertAttendanceBatch(records) {
  if (records.length === 0) return 0

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO attendance_records (name, work_date, morning_on_time, morning_off_time, afternoon_on_time, afternoon_off_time, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )

  let inserted = 0
  for (const r of records) {
    await new Promise((resolve, reject) => {
      stmt.run(
        [r.name, r.work_date, r.morning_on_time, r.morning_off_time, r.afternoon_on_time, r.afternoon_off_time, r.batch_id],
        function(err) {
          if (err) reject(err)
          else {
            // INSERT OR IGNORE 命中唯一索引时 changes 为 0，不能按调用次数计数
            if (this.changes > 0) inserted++
            resolve()
          }
        }
      )
    })
  }
  await new Promise((resolve) => stmt.finalize(resolve))
  return inserted
}

function addAnomaly(anomalyRecords, record, date, name, punchType, anomalyType, color, grade) {
  anomalyRecords.push({ date, name, punchType, anomalyType, color, grade })
}

// ==================== 路由处理函数 ====================

// POST /upload - 上传并导入Excel
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const perm = await checkAttendancePermission(req.user, 'upload')
    if (!perm.allowed) return forbidden(res, perm.reason)
    if (!req.file) return badRequest(res, '请上传文件')

    const filePath = req.file.path
    let imported = 0
    let batchId = ''
    
    try {
      const wb = XLSX.readFile(filePath)
      const sheetName = wb.SheetNames[0]
      if (!sheetName) {
        return badRequest(res, 'Excel文件不包含任何工作表')
      }

      const ws = wb.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      if (jsonData.length <= 4) {
        return badRequest(res, 'Excel数据不足（至少需要5行）')
      }

      batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const records = []
      const skipped = { notInGroup: 0, rest: 0, duplicate: 0 }

      // 先解析出待导入记录，再按涉及日期一次性读取已有记录用于去重统计
      const parsedRecords = []
      const workDates = new Set()

      for (let i = 4; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!row || !Array.isArray(row)) continue

        const name = String(row[0] || '').trim()
        const attendanceGroup = String(row[1] || '').trim()
        const timestamp = row[7]
        const shiftName = String(row[8] || '').trim()
        const morningOn = normalizePunchTime(row[9])
        const morningOff = normalizePunchTime(row[11])
        const afternoonOn = normalizePunchTime(row[13])
        const afternoonOff = normalizePunchTime(row[15])

        if (!name) continue
        if (attendanceGroup === '未加入考勤组') { skipped.notInGroup++; continue }
        if (shiftName === '休息') { skipped.rest++; continue }

        let workDate = ''
        if (timestamp && !isNaN(Number(timestamp))) {
          const d = new Date(Number(timestamp))
          workDate = formatDate(d)
        }
        if (!workDate) continue

        parsedRecords.push({
          name,
          work_date: workDate,
          morning_on_time: morningOn,
          morning_off_time: morningOff,
          afternoon_on_time: afternoonOn,
          afternoon_off_time: afternoonOff,
          batch_id: batchId
        })
        workDates.add(workDate)
      }

      const existingKeys = new Set()
      if (workDates.size > 0) {
        const dates = Array.from(workDates)
        const placeholders = dates.map(() => '?').join(',')
        const existingRows = await allQuery(
          `SELECT name, work_date FROM attendance_records WHERE work_date IN (${placeholders})`,
          dates
        )
        for (const r of existingRows) {
          existingKeys.add(`${r.name}|${r.work_date}`)
        }
      }

      const seenKeys = new Set()
      for (const record of parsedRecords) {
        const key = `${record.name}|${record.work_date}`
        if (existingKeys.has(key) || seenKeys.has(key)) { skipped.duplicate++; continue }
        seenKeys.add(key)
        records.push(record)
      }

      if (records.length > 0) {
        imported = await insertAttendanceBatch(records)
      }

      success(res, {
        batchId,
        imported,
        skipped: skipped.notInGroup + skipped.rest + skipped.duplicate,
        details: skipped
      }, '导入成功')
    } finally {
      try { fs.unlinkSync(filePath) } catch (e) {}
    }
  } catch (err) {
    logger.error('考勤导入错误', { error: err.message })
    error(res, '导入失败: ' + err.message)
  }
})

// DELETE /records - 删除指定月份考勤数据
router.delete('/records', async (req, res) => {
  try {
    const month = req.query.month
    if (!month) return badRequest(res, '请指定月份')
    if (!isValidMonthString(month)) return badRequest(res, '月份格式不正确，应为 YYYY-MM')

    const monthPrefix = month + '-%'
    let result

    if (req.user.role === 'teacher') {
      result = await runQuery(
        'DELETE FROM attendance_records WHERE work_date LIKE ?',
        [monthPrefix]
      )
    } else {
      const perm = await checkAttendancePermission(req.user, 'upload')
      if (!perm.allowed) return forbidden(res, perm.reason)

      // 学生仅能删除自己的考勤记录，避免误删全组数据
      result = await runQuery(
        'DELETE FROM attendance_records WHERE work_date LIKE ? AND name = ?',
        [monthPrefix, req.user.username]
      )
    }

    success(res, { 
      deleted: result.changes,
      month 
    }, `已删除 ${month} 的 ${result.changes} 条考勤记录`)
  } catch (err) {
    logger.error('删除考勤错误', { error: err.message })
    error(res, '删除失败: ' + err.message)
  }
})

// GET /overview - 考勤总览统计（单月）
router.get('/overview', async (req, res) => {
  try {
    const month = req.query.month || getDefaultMonth()
    const monthPrefix = month + '-%'
    const grade = req.query.grade

    const rows = await getAttendanceRows(monthPrefix, {
      grade,
      userRole: req.user.role,
      username: req.user.username
    })

    const studentMap = {}
    for (const r of rows) {
      if (!studentMap[r.name]) {
        studentMap[r.name] = {
          name: r.name,
          grade: r.student_grade || '',
          totalDays: 0,
          normalDays: 0,
          lateDays: 0,
          earlyLeaveDays: 0,
          missingPunchDays: 0,
          absenteeismDays: 0,
          anomalyPunches: 0,
          totalPunches: 0
        }
      }
      const s = studentMap[r.name]
      s.totalDays++
      s.totalPunches += 4
      s.anomalyPunches += countAbnormalPunches(r)
      const status = getDayStatus(r)
      if (status === '正常') s.normalDays++
      else if (status === '迟到') s.lateDays++
      else if (status === '早退') s.earlyLeaveDays++
      else if (status === '缺卡') s.missingPunchDays++
      else if (status === '旷工') s.absenteeismDays++
    }

    const students = Object.values(studentMap).map(s => ({
      ...s,
      anomalyRate: s.totalPunches > 0 ? Math.round((s.anomalyPunches / s.totalPunches) * 100) : 0
    }))

    success(res, { month, students })
  } catch (err) {
    logger.error('考勤总览错误', { error: err.message })
    error(res, '获取考勤总览失败: ' + err.message)
  }
})

// GET /overview-range - 考勤总览统计（时间范围）
router.get('/overview-range', async (req, res) => {
  try {
    const startMonth = req.query.startMonth
    const endMonth = req.query.endMonth
    const grade = req.query.grade

    if (!startMonth || !endMonth) {
      return badRequest(res, '请指定开始月份和结束月份')
    }
    if (!isValidMonthString(startMonth) || !isValidMonthString(endMonth)) {
      return badRequest(res, '月份格式不正确，应为 YYYY-MM')
    }
    if (startMonth > endMonth) {
      return badRequest(res, '开始月份不能晚于结束月份')
    }

    const startDate = new Date(`${startMonth}-01`)
    const endDate = new Date(`${endMonth}-01`)
    
    const studentMap = {}
    let currentDate = new Date(startDate)
    
    let effectiveRole = req.user.role
    if (req.user.role === 'student') {
      const perm = await checkAttendancePermission(req.user, 'upload')
      if (perm.allowed) {
        effectiveRole = 'teacher'
      }
    }
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, '0')
      const monthPrefix = `${year}-${month}-%`

      const rows = await getAttendanceRows(monthPrefix, {
        grade,
        userRole: effectiveRole,
        username: req.user.username
      })

      for (const r of rows) {
        if (!studentMap[r.name]) {
          studentMap[r.name] = {
            name: r.name,
            grade: r.student_grade || '',
            totalDays: 0,
            normalDays: 0,
            lateDays: 0,
            earlyLeaveDays: 0,
            missingPunchDays: 0,
            absenteeismDays: 0,
            anomalyPunches: 0,
            totalPunches: 0
          }
        }
        const s = studentMap[r.name]
        s.totalDays++
        s.totalPunches += 4
        s.anomalyPunches += countAbnormalPunches(r)
        const status = getDayStatus(r)
        if (status === '正常') s.normalDays++
        else if (status === '迟到') s.lateDays++
        else if (status === '早退') s.earlyLeaveDays++
        else if (status === '缺卡') s.missingPunchDays++
        else if (status === '旷工') s.absenteeismDays++
      }

      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    const students = Object.values(studentMap).map(s => ({
      ...s,
      anomalyRate: s.totalPunches > 0 ? Math.round((s.anomalyPunches / s.totalPunches) * 100) : 0
    }))

    success(res, { startMonth, endMonth, students })
  } catch (err) {
    logger.error('考勤总览范围错误', { error: err.message })
    error(res, '获取考勤总览失败: ' + err.message)
  }
})

// GET /records - 考勤明细
router.get('/records', async (req, res) => {
  try {
    const month = req.query.month || getDefaultMonth()
    const monthPrefix = month + '-%'

    const rows = await getAttendanceRows(monthPrefix, {
      name: req.query.name,
      userRole: req.user.role,
      username: req.user.username
    })

    const records = rows.map(r => attachResults({
      id: r.id,
      name: r.name,
      work_date: r.work_date,
      morning_on_time: r.morning_on_time,
      morning_off_time: r.morning_off_time,
      afternoon_on_time: r.afternoon_on_time,
      afternoon_off_time: r.afternoon_off_time,
      batch_id: r.batch_id
    }))

    success(res, { month, records })
  } catch (err) {
    logger.error('考勤明细错误', { error: err.message })
    error(res, '获取考勤明细失败: ' + err.message)
  }
})

// GET /student/:name - 某学生考勤明细
router.get('/student/:name', async (req, res) => {
  try {
    const { name } = req.params
    const month = req.query.month || getDefaultMonth()
    const monthPrefix = month + '-%'

    if (req.user.username !== name && !(await canViewOthersAttendance(req.user))) {
      return forbidden(res, '只能查看自己的考勤')
    }

    const rows = await allQuery(
      'SELECT * FROM attendance_records WHERE name = ? AND work_date LIKE ? ORDER BY work_date',
      [name, monthPrefix]
    )

    const records = rows.map(r => attachResults({
      id: r.id,
      name: r.name,
      work_date: r.work_date,
      morning_on_time: r.morning_on_time,
      morning_off_time: r.morning_off_time,
      afternoon_on_time: r.afternoon_on_time,
      afternoon_off_time: r.afternoon_off_time,
      batch_id: r.batch_id
    }))

    success(res, { name, month, records })
  } catch (err) {
    logger.error('学生考勤明细错误', { error: err.message })
    error(res, '获取学生考勤明细失败: ' + err.message)
  }
})

// GET /student/:name/summary - 某学生当月汇总
router.get('/student/:name/summary', async (req, res) => {
  try {
    const { name } = req.params
    const month = req.query.month || getDefaultMonth()
    const monthPrefix = month + '-%'

    if (req.user.username !== name && !(await canViewOthersAttendance(req.user))) {
      return forbidden(res, '只能查看自己的考勤')
    }

    const rows = await allQuery(
      'SELECT * FROM attendance_records WHERE name = ? AND work_date LIKE ? ORDER BY work_date',
      [name, monthPrefix]
    )

    const summary = {
      name,
      month,
      totalDays: 0,
      normalDays: 0,
      lateDays: 0,
      earlyLeaveDays: 0,
      missingPunchDays: 0,
      absenteeismDays: 0,
      anomalyPunches: 0,
      totalPunches: 0
    }

    for (const r of rows) {
      summary.totalDays++
      summary.totalPunches += 4
      summary.anomalyPunches += countAbnormalPunches(r)
      const status = getDayStatus(r)
      if (status === '正常') summary.normalDays++
      else if (status === '迟到') summary.lateDays++
      else if (status === '早退') summary.earlyLeaveDays++
      else if (status === '缺卡') summary.missingPunchDays++
      else if (status === '旷工') summary.absenteeismDays++
    }

    summary.anomalyRate = summary.totalPunches > 0
      ? Math.round((summary.anomalyPunches / summary.totalPunches) * 100)
      : 0

    success(res, summary)
  } catch (err) {
    logger.error('学生汇总错误', { error: err.message })
    error(res, '获取学生汇总失败: ' + err.message)
  }
})

// GET /student/:name/overview-range - 某学生时间范围汇总
router.get('/student/:name/overview-range', async (req, res) => {
  try {
    const { name } = req.params
    const startMonth = req.query.startMonth
    const endMonth = req.query.endMonth

    if (!startMonth || !endMonth) {
      return badRequest(res, '请指定开始月份和结束月份')
    }
    if (!isValidMonthString(startMonth) || !isValidMonthString(endMonth)) {
      return badRequest(res, '月份格式不正确，应为 YYYY-MM')
    }
    if (startMonth > endMonth) {
      return badRequest(res, '开始月份不能晚于结束月份')
    }

    if (req.user.username !== name && !(await canViewOthersAttendance(req.user))) {
      return forbidden(res, '只能查看自己的考勤')
    }

    const startDate = new Date(`${startMonth}-01`)
    const endDate = new Date(`${endMonth}-01`)
    
    const summary = {
      name,
      startMonth,
      endMonth,
      totalDays: 0,
      normalDays: 0,
      lateDays: 0,
      earlyLeaveDays: 0,
      missingPunchDays: 0,
      absenteeismDays: 0,
      anomalyPunches: 0,
      totalPunches: 0
    }
    
    let currentDate = new Date(startDate)
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, '0')
      const monthPrefix = `${year}-${month}-%`

      const rows = await allQuery(
        'SELECT * FROM attendance_records WHERE name = ? AND work_date LIKE ? ORDER BY work_date',
        [name, monthPrefix]
      )

      for (const r of rows) {
        summary.totalDays++
        summary.totalPunches += 4
        summary.anomalyPunches += countAbnormalPunches(r)
        const status = getDayStatus(r)
        if (status === '正常') summary.normalDays++
        else if (status === '迟到') summary.lateDays++
        else if (status === '早退') summary.earlyLeaveDays++
        else if (status === '缺卡') summary.missingPunchDays++
        else if (status === '旷工') summary.absenteeismDays++
      }

      currentDate.setMonth(currentDate.getMonth() + 1)
    }

    summary.anomalyRate = summary.totalPunches > 0
      ? Math.round((summary.anomalyPunches / summary.totalPunches) * 100)
      : 0

    success(res, summary)
  } catch (err) {
    logger.error('学生时间范围汇总错误', { error: err.message })
    error(res, '获取学生汇总失败: ' + err.message)
  }
})

// PUT /record/:id - 修改考勤记录
router.put('/record/:id', async (req, res) => {
  try {
    const perm = await checkAttendancePermission(req.user, 'edit')
    if (!perm.allowed) return forbidden(res, perm.reason)

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, '记录ID不合法')

    const record = await getQuery('SELECT * FROM attendance_records WHERE id = ?', [id])
    if (!record) return notFound(res, '记录不存在')

    if (req.user.role !== 'teacher' && record.name !== req.user.username) {
      return forbidden(res, '只能修改自己的考勤记录')
    }

    const { morning_on_time, morning_off_time, afternoon_on_time, afternoon_off_time } = req.body
    const updates = {}
    if (morning_on_time !== undefined) updates.morning_on_time = normalizePunchTime(morning_on_time)
    if (morning_off_time !== undefined) updates.morning_off_time = normalizePunchTime(morning_off_time)
    if (afternoon_on_time !== undefined) updates.afternoon_on_time = normalizePunchTime(afternoon_on_time)
    if (afternoon_off_time !== undefined) updates.afternoon_off_time = normalizePunchTime(afternoon_off_time)

    if (Object.keys(updates).length === 0) {
      return badRequest(res, '没有需要更新的字段')
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    values.push(id)

    await runQuery(`UPDATE attendance_records SET ${setClauses} WHERE id = ?`, values)

    const updated = await getQuery('SELECT * FROM attendance_records WHERE id = ?', [id])
    success(res, attachResults({
      id: updated.id,
      name: updated.name,
      work_date: updated.work_date,
      morning_on_time: updated.morning_on_time,
      morning_off_time: updated.morning_off_time,
      afternoon_on_time: updated.afternoon_on_time,
      afternoon_off_time: updated.afternoon_off_time,
      batch_id: updated.batch_id
    }), '修改成功')
  } catch (err) {
    logger.error('修改考勤错误', { error: err.message })
    error(res, '修改失败: ' + err.message)
  }
})

// GET /permissions - 权限列表
router.get('/permissions', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return forbidden(res, '无权操作')

    const rows = await allQuery(`
      SELECT ap.*, u.username as student_username, u.student_major
      FROM attendance_permissions ap
      JOIN users u ON ap.student_id = u.id
      ORDER BY ap.created_at DESC
    `)

    success(res, rows)
  } catch (err) {
    logger.error('权限列表错误', { error: err.message })
    error(res, '获取权限列表失败: ' + err.message)
  }
})

// POST /permissions - 授权学生
router.post('/permissions', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return forbidden(res, '无权操作')

    const { student_id, can_upload, can_edit } = req.body
    if (!student_id) return badRequest(res, '请选择学生')

    const student = await getQuery(
      'SELECT id, username FROM users WHERE id = ? AND role = ?',
      [student_id, 'student']
    )
    if (!student) return badRequest(res, '学生不存在')

    const existing = await getQuery(
      'SELECT id FROM attendance_permissions WHERE student_id = ?',
      [student_id]
    )

    if (existing) {
      await runQuery(
        'UPDATE attendance_permissions SET can_upload = ?, can_edit = ?, granted_by = ? WHERE student_id = ?',
        [can_upload !== false ? 1 : 0, can_edit !== false ? 1 : 0, req.user.id, student_id]
      )
    } else {
      await runQuery(
        'INSERT INTO attendance_permissions (student_id, granted_by, can_upload, can_edit) VALUES (?, ?, ?, ?)',
        [student_id, req.user.id, can_upload !== false ? 1 : 0, can_edit !== false ? 1 : 0]
      )
    }

    success(res, null, '权限设置成功')
  } catch (err) {
    logger.error('授权错误', { error: err.message })
    error(res, '授权失败: ' + err.message)
  }
})

// DELETE /permissions/:studentId - 撤销权限
router.delete('/permissions/:studentId', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return forbidden(res, '无权操作')

    const { studentId } = req.params
    await runQuery('DELETE FROM attendance_permissions WHERE student_id = ?', [studentId])
    success(res, null, '权限已撤销')
  } catch (err) {
    logger.error('撤销权限错误', { error: err.message })
    error(res, '撤销失败: ' + err.message)
  }
})

// GET /my-permission - 获取当前用户的考勤权限
router.get('/my-permission', async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      return success(res, { can_upload: true, can_edit: true, is_teacher: true })
    }

    const perm = await getQuery(
      'SELECT * FROM attendance_permissions WHERE student_id = ?',
      [req.user.id]
    )
    if (!perm) {
      return success(res, { can_upload: false, can_edit: false, is_teacher: false })
    }
    success(res, {
      can_upload: perm.can_upload === 1,
      can_edit: perm.can_edit === 1,
      is_teacher: false
    })
  } catch (err) {
    logger.error('获取权限错误', { error: err.message })
    error(res, '获取权限失败: ' + err.message)
  }
})

// GET /anomaly-records - 获取异常打卡明细（用于日历展示）
router.get('/anomaly-records', async (req, res) => {
  try {
    let effectiveRole = req.user.role
    if (req.user.role === 'student') {
      const perm = await checkAttendancePermission(req.user, 'upload')
      if (!perm.allowed) return forbidden(res, perm.reason)
      effectiveRole = 'teacher'
    }

    const month = req.query.month || getDefaultMonth()
    const grade = req.query.grade
    const monthPrefix = month + '-%'

    // 获取所有年级
    const allGradeRows = await allQuery(
      `SELECT DISTINCT u.student_grade
       FROM attendance_records ar
       LEFT JOIN users u ON ar.name = u.username
       WHERE ar.work_date LIKE ? AND u.student_grade IS NOT NULL
       ORDER BY u.student_grade`,
      [monthPrefix]
    )
    const grades = allGradeRows.map(r => r.student_grade).filter(Boolean)

    const rows = await getAttendanceRows(monthPrefix, {
      grade,
      userRole: effectiveRole
    })

    // 处理异常打卡记录
    const anomalyRecords = []

    for (const r of rows) {
      const recordWithResult = attachResults(r)

      // 上午上班
      if (recordWithResult.morning_on_result === '迟到') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, r.morning_on_time || PUNCH_TIMES.morningOn, '迟到', ANOMALY_COLORS.late, r.student_grade)
      } else if (recordWithResult.morning_on_result === '缺卡') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, PUNCH_TIMES.morningOn, '缺卡', ANOMALY_COLORS.absent, r.student_grade)
      }

      // 上午下班
      if (recordWithResult.morning_off_result === '早退') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, r.morning_off_time || PUNCH_TIMES.morningOff, '早退', ANOMALY_COLORS.late, r.student_grade)
      } else if (recordWithResult.morning_off_result === '缺卡') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, PUNCH_TIMES.morningOff, '缺卡', ANOMALY_COLORS.absent, r.student_grade)
      }

      // 下午上班
      if (recordWithResult.afternoon_on_result === '迟到') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, r.afternoon_on_time || PUNCH_TIMES.afternoonOn, '迟到', ANOMALY_COLORS.late, r.student_grade)
      } else if (recordWithResult.afternoon_on_result === '缺卡') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, PUNCH_TIMES.afternoonOn, '缺卡', ANOMALY_COLORS.absent, r.student_grade)
      }

      // 下午下班
      if (recordWithResult.afternoon_off_result === '早退') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, r.afternoon_off_time || PUNCH_TIMES.afternoonOff, '早退', ANOMALY_COLORS.late, r.student_grade)
      } else if (recordWithResult.afternoon_off_result === '缺卡') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, PUNCH_TIMES.afternoonOff, '缺卡', ANOMALY_COLORS.absent, r.student_grade)
      }

      // 全天旷工
      if (recordWithResult.day_status === '旷工') {
        addAnomaly(anomalyRecords, r, r.work_date, r.name, '旷工', '旷工', ANOMALY_COLORS.absent, r.student_grade)
      }
    }

    success(res, { month, anomalyRecords, grades })
  } catch (err) {
    logger.error('获取异常记录错误', { error: err.message })
    error(res, '获取异常记录失败: ' + err.message)
  }
})

module.exports = router
