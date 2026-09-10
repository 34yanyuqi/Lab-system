const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { runQuery, getQuery, allQuery } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');
const { createNotification } = require('../utils/notification');
const { sendTaskNotificationEmail } = require('../utils/email');
const { sanitizeHtml, isNonEmptyString, isValidDateString, toPositiveInt } = require('../utils/sanitize');

const router = express.Router();
const uploadsRoot = path.join(__dirname, '..', 'uploads', 'tasks');
const taskDocDir = path.join(uploadsRoot, 'docs');
const taskImageDir = path.join(uploadsRoot, 'images');

function fixOriginalName(name) {
  if (!name) return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf-8');
  } catch {
    return name;
  }
}

fs.mkdirSync(taskDocDir, { recursive: true });
fs.mkdirSync(taskImageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'content_image') {
      cb(null, taskImageDir);
      return;
    }
    cb(null, taskDocDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, uniqueName);
  }
});

// 支持的附件类型：pdf、压缩包(zip/rar/7z)
// 所有文件大小限制 100MB
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedTypes = ['.pdf', '.zip', '.rar', '.7z'];
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PDF 或压缩包格式（pdf/zip/rar/7z）'), false);
    }
  }
});

/** 任务字段校验，返回 { error } 或 { checkFrequency } */
function validateTaskPayload({ title, type, end_date, check_frequency }) {
  if (!isNonEmptyString(title, 200)) {
    return { error: '任务标题不能为空且不超过200个字符' };
  }
  if (!isNonEmptyString(type, 50)) {
    return { error: '任务类型不能为空' };
  }
  if (!isValidDateString(end_date)) {
    return { error: '截止日期格式不正确，应为 YYYY-MM-DD' };
  }
  const frequency = check_frequency === undefined || check_frequency === null || check_frequency === ''
    ? 7
    : toPositiveInt(check_frequency);
  if (frequency === null || frequency > 365) {
    return { error: '检查频率需为 1-365 之间的整数' };
  }
  return { checkFrequency: frequency };
}

function parseStudentIds(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return value ? [Number(value)].filter(Boolean) : [];
    }
  }
  return [];
}

function parseTaskDocument(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      const url = parsed.url || '';
      if (url) {
        return {
          name: parsed.name || path.basename(url),
          url,
          kind: parsed.kind || (url.startsWith('/uploads/') ? 'file' : 'link')
        };
      }
    }
  } catch {
    // Keep compatibility with legacy plain-string values.
  }

  const raw = String(rawValue).trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return {
      name: raw,
      url: raw,
      kind: 'link'
    };
  }

  if (raw.startsWith('/uploads/')) {
    return {
      name: path.basename(raw),
      url: raw,
      kind: 'file'
    };
  }

  return {
    name: raw,
    url: raw,
    kind: 'link'
  };
}

function serializeTaskDocument(file) {
  return JSON.stringify({
    name: fixOriginalName(file.originalname),
    url: `/uploads/tasks/docs/${file.filename}`,
    kind: 'file'
  });
}

function serializeTaskLink(link) {
  return JSON.stringify({
    name: link,
    url: link,
    kind: 'link'
  });
}

function removeTaskDocument(rawValue) {
  const fileInfo = parseTaskDocument(rawValue);
  if (!fileInfo?.url || !fileInfo.url.startsWith('/uploads/')) return;

  const relativePath = fileInfo.url.replace(/^\/+/, '');
  const absolutePath = path.join(__dirname, '..', relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function decorateTask(task) {
  const doc = parseTaskDocument(task?.doc_url);
  return {
    ...task,
    doc_name: doc?.name || '',
    doc_file_url: doc?.url || '',
    doc_kind: doc?.kind || ''
  };
}

router.use(authMiddleware);
router.use(requireEmailVerification);

router.get('/', async (req, res) => {
  try {
    let tasks;
    if (req.user.role === 'teacher') {
      tasks = await allQuery(
        'SELECT * FROM tasks WHERE teacher_id = ? ORDER BY create_time DESC',
        [req.user.id]
      );
    } else {
      const activeTasks = await allQuery(
        'SELECT * FROM tasks WHERE status = ? ORDER BY create_time DESC',
        ['active']
      );
      tasks = activeTasks.filter(task => {
        try {
          const studentIds = JSON.parse(task.student_ids || '[]');
          return Array.isArray(studentIds) && studentIds.includes(req.user.id);
        } catch {
          return false;
        }
      });
    }

    // 批量补齐教师姓名与提交数量，避免逐条查询造成 N+1
    const taskIds = tasks.map(task => task.id);
    const teacherIds = [...new Set(tasks.map(task => task.teacher_id))];

    const submissionCounts = new Map();
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const rows = await allQuery(
        `SELECT task_id, COUNT(*) as count FROM submissions WHERE task_id IN (${placeholders}) GROUP BY task_id`,
        taskIds
      );
      for (const row of rows) submissionCounts.set(row.task_id, row.count);
    }

    const teacherNames = new Map();
    if (teacherIds.length > 0) {
      const placeholders = teacherIds.map(() => '?').join(',');
      const rows = await allQuery(
        `SELECT id, teacher_name FROM users WHERE id IN (${placeholders})`,
        teacherIds
      );
      for (const row of rows) teacherNames.set(row.id, row.teacher_name || '');
    }

    for (const task of tasks) {
      task.teacher_name = teacherNames.get(task.teacher_id) || '';
      try {
        const studentIds = JSON.parse(task.student_ids || '[]');
        task.assigned_count = Array.isArray(studentIds) ? studentIds.length : 0;
      } catch {
        task.assigned_count = 0;
      }
      task.submitted_count = submissionCounts.get(task.id) || 0;
    }

    res.json(tasks.map(decorateTask));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const taskId = toPositiveInt(req.params.id);
    if (!taskId) {
      return res.status(400).json({ error: '任务ID不合法' });
    }

    const task = await getQuery('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 越权访问防护：教师只能看自己的任务，学生只能看分配给自己的任务
    if (req.user.role === 'teacher') {
      if (task.teacher_id !== req.user.id) {
        return res.status(403).json({ error: '无权访问该任务' });
      }
    } else {
      let assignedIds = [];
      try {
        const parsed = JSON.parse(task.student_ids || '[]');
        assignedIds = Array.isArray(parsed) ? parsed.map(Number) : [];
      } catch {
        assignedIds = [];
      }
      if (!assignedIds.includes(Number(req.user.id))) {
        return res.status(403).json({ error: '该任务未分配给您' });
      }
    }

    res.json(decorateTask(task));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/upload-image', upload.single('content_image'), async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    res.json({
      url: `/uploads/tasks/images/${req.file.filename}`,
      name: fixOriginalName(req.file.originalname)
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', upload.single('doc_file'), async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const {
      title,
      type,
      content,
      student_ids,
      end_date,
      check_frequency = 7,
      doc_url
    } = req.body;

    const validation = validateTaskPayload({ title, type, end_date, check_frequency });
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const parsedStudentIds = parseStudentIds(student_ids);
    const normalizedDoc = req.file
      ? serializeTaskDocument(req.file)
      : doc_url
        ? serializeTaskLink(doc_url)
        : '';

    const result = await runQuery(
      `INSERT INTO tasks (title, type, content, teacher_id, student_ids, end_date, check_frequency, doc_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        String(type).trim(),
        sanitizeHtml(content || ''),
        req.user.id,
        JSON.stringify(parsedStudentIds),
        end_date,
        validation.checkFrequency,
        normalizedDoc,
        'active'
      ]
    );

    for (const studentId of parsedStudentIds) {
      await createNotification(
        studentId,
        'task_assign',
        '新任务通知',
        `您有一个新任务「${title.trim()}」，截止日期：${end_date}`,
        result.lastID
      );

      const student = await getQuery('SELECT student_email FROM users WHERE id = ?', [studentId]);
      if (student?.student_email) {
        await sendTaskNotificationEmail(student.student_email, title.trim(), sanitizeHtml(content || ''));
      }
    }

    const newTask = await getQuery('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    res.status(201).json(decorateTask(newTask));
  } catch (err) {
    console.error('创建任务错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', upload.single('doc_file'), async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const existingTask = await getQuery('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?', [req.params.id, req.user.id]);
    if (!existingTask) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const {
      title,
      type,
      content,
      student_ids,
      end_date,
      check_frequency,
      doc_url,
      status,
      keep_existing_doc
    } = req.body;

    const validation = validateTaskPayload({ title, type, end_date, check_frequency });
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const parsedStudentIds = parseStudentIds(student_ids);
    let normalizedDoc = '';

    if (req.file) {
      removeTaskDocument(existingTask.doc_url);
      normalizedDoc = serializeTaskDocument(req.file);
    } else if (keep_existing_doc === 'true') {
      normalizedDoc = existingTask.doc_url || '';
    } else if (doc_url) {
      removeTaskDocument(existingTask.doc_url);
      normalizedDoc = serializeTaskLink(doc_url);
    } else {
      removeTaskDocument(existingTask.doc_url);
      normalizedDoc = '';
    }

    await runQuery(
      `UPDATE tasks SET title = ?, type = ?, content = ?, student_ids = ?, end_date = ?, check_frequency = ?, doc_url = ?, status = ?
       WHERE id = ? AND teacher_id = ?`,
      [
        title.trim(),
        String(type).trim(),
        sanitizeHtml(content || ''),
        JSON.stringify(parsedStudentIds),
        end_date,
        validation.checkFrequency,
        normalizedDoc,
        status || existingTask.status,
        req.params.id,
        req.user.id
      ]
    );

    // 只对本次新增的学生发送任务通知，避免重复打扰
    const previousStudentIds = parseStudentIds(existingTask.student_ids);
    const addedStudentIds = parsedStudentIds.filter(id => !previousStudentIds.includes(id));
    for (const studentId of addedStudentIds) {
      await createNotification(
        studentId,
        'task_assign',
        '新任务通知',
        `您有一个新任务「${title.trim()}」，截止日期：${end_date}`,
        Number(req.params.id)
      );

      const student = await getQuery('SELECT student_email FROM users WHERE id = ?', [studentId]);
      if (student?.student_email) {
        await sendTaskNotificationEmail(student.student_email, title.trim(), sanitizeHtml(content || ''));
      }
    }

    const updatedTask = await getQuery('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(decorateTask(updatedTask));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const task = await getQuery('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?', [req.params.id, req.user.id]);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    if (task.doc_url) {
      removeTaskDocument(task.doc_url);
    }
    await runQuery('DELETE FROM ai_chat_history WHERE submission_id IN (SELECT id FROM submissions WHERE task_id = ?)', [task.id]);
    await runQuery('DELETE FROM submissions WHERE task_id = ?', [task.id]);
    await runQuery('DELETE FROM tasks WHERE id = ? AND teacher_id = ?', [task.id, req.user.id]);

    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
