const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { runQuery, getQuery, allQuery } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');
const { createNotification } = require('../utils/notification');
const { sendReviewResultEmail } = require('../utils/email');
const { sanitizeHtml, summarizeHtml, toPositiveInt, normalizeIdArray } = require('../utils/sanitize');

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

// 通知正文在首页/通知中心是按纯文本渲染的（直接输出 content 字段），
// 所以评语必须先转成纯文本摘要，否则页面上会显示出 <p>、<img src="data:..."> 这类标签。

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads', 'submissions');
const imageDir = path.join(__dirname, '..', 'uploads', 'submissions', 'images');

function fixOriginalName(name) {
  if (!name) return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf-8');
  } catch {
    return name;
  }
}

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(imageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
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

function parseStoredFile(rawValue) {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    if (parsed && typeof parsed === 'object') {
      const url = parsed.url || parsed.path || '';
      if (url) {
        return {
          name: parsed.name || path.basename(url),
          url
        };
      }
    }
  } catch {
    // Keep backward compatibility for legacy plain-string values.
  }

  const raw = String(rawValue).trim();
  if (!raw) return null;

  if (raw.startsWith('/uploads/')) {
    return {
      name: path.basename(raw),
      url: raw
    };
  }

  return {
    name: raw,
    url: `/uploads/${raw}`
  };
}

function serializeStoredFile(file) {
  return JSON.stringify({
    name: fixOriginalName(file.originalname),
    url: `/uploads/submissions/${file.filename}`
  });
}

function removeStoredFile(rawValue) {
  const fileInfo = parseStoredFile(rawValue);
  if (!fileInfo?.url || !fileInfo.url.startsWith('/uploads/')) return;

  const relativePath = fileInfo.url.replace(/^\/+/, '');
  const absolutePath = path.join(__dirname, '..', relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function decorateSubmission(row) {
  const fileInfo = parseStoredFile(row?.submit_file);
  return {
    ...row,
    submit_file_name: fileInfo?.name || '',
    submit_file_url: fileInfo?.url || ''
  };
}

router.use(authMiddleware);
router.use(requireEmailVerification);

router.post('/upload-image', multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, imageDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持PNG、JPEG、WebP和GIF格式的图片'), false);
    }
  }
}).single('content_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    console.log(`图片上传成功: ${fixOriginalName(req.file.originalname)} -> ${req.file.filename}`);
    res.json({
      url: `/uploads/submissions/images/${req.file.filename}`,
      name: fixOriginalName(req.file.originalname)
    });
  } catch (err) {
    console.error('图片上传错误:', err);
    res.status(500).json({ error: err.message || '服务器错误' });
  }
});

router.get('/', async (req, res) => {
  try {
    let submissions;
    if (req.user.role === 'teacher') {
      submissions = await allQuery(`
        SELECT s.*, u.student_id as student_school_id, u.username as student_name, u.student_grade, u.student_major, t.title as task_title
        FROM submissions s
        JOIN users u ON s.student_id = u.id
        JOIN tasks t ON s.task_id = t.id
        WHERE t.teacher_id = ?
        ORDER BY s.submit_time DESC
      `, [req.user.id]);
    } else {
      submissions = await allQuery(`
        SELECT s.*, t.title as task_title, t.end_date, t.teacher_id
        FROM submissions s
        JOIN tasks t ON s.task_id = t.id
        WHERE s.student_id = ?
        ORDER BY s.submit_time DESC
      `, [req.user.id]);
    }
    res.json(submissions.map(decorateSubmission));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/task/:taskId', async (req, res) => {
  try {
    const taskId = toPositiveInt(req.params.taskId);
    if (!taskId) {
      return res.status(400).json({ error: '任务ID不合法' });
    }

    let submissions;
    if (req.user.role === 'teacher') {
      // 越权访问防护：只能查看自己名下任务的提交
      const ownedTask = await getQuery('SELECT id FROM tasks WHERE id = ? AND teacher_id = ?', [taskId, req.user.id]);
      if (!ownedTask) {
        return res.status(404).json({ error: '任务不存在或无权访问' });
      }
      submissions = await allQuery(`
        SELECT s.*, u.student_id as student_school_id, u.username as student_name, u.student_major, u.student_email
        FROM submissions s
        JOIN users u ON s.student_id = u.id
        WHERE s.task_id = ?
        ORDER BY s.submit_time DESC
      `, [taskId]);
    } else {
      submissions = await allQuery(`
        SELECT * FROM submissions WHERE task_id = ? AND student_id = ?
      `, [taskId, req.user.id]);
    }
    res.json(submissions.map(decorateSubmission));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', upload.single('submit_file'), async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '无权操作' });
    }

    const { task_id, submit_content, keep_existing_file, week_number } = req.body;

    const taskId = toPositiveInt(task_id);
    if (!taskId) {
      return res.status(400).json({ error: '任务ID不合法' });
    }

    const weekNum = week_number === undefined || week_number === null || week_number === ''
      ? 1
      : toPositiveInt(week_number);
    if (weekNum === null || weekNum > 200) {
      return res.status(400).json({ error: '周次需为 1-200 之间的整数' });
    }

    if (submit_content && String(submit_content).length > 200000) {
      return res.status(400).json({ error: '提交内容过长，请精简后再提交' });
    }

    const task = await getQuery('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    if (task.status !== 'active') {
      return res.status(400).json({ error: '任务已关闭，无法提交' });
    }

    let assignedStudentIds = [];
    try {
      assignedStudentIds = JSON.parse(task.student_ids || '[]');
    } catch {
      assignedStudentIds = [];
    }

    if (!Array.isArray(assignedStudentIds) || !assignedStudentIds.includes(req.user.id)) {
      return res.status(403).json({ error: '该任务未分配给当前学生' });
    }

    const endDate = new Date(`${task.end_date}T23:59:59`);
    const today = new Date();

    const existingSubmission = await getQuery(
      'SELECT * FROM submissions WHERE task_id = ? AND student_id = ? AND week_number = ?',
      [taskId, req.user.id, weekNum]
    );

    if (today > endDate && !existingSubmission) {
      return res.status(400).json({ error: '任务已截止，无法提交' });
    }

    let submitFileValue = '';
    if (req.file) {
      if (existingSubmission?.submit_file) {
        removeStoredFile(existingSubmission.submit_file);
      }
      submitFileValue = serializeStoredFile(req.file);
    } else if (existingSubmission && keep_existing_file === 'true') {
      submitFileValue = existingSubmission.submit_file || '';
    } else {
      if (existingSubmission?.submit_file) {
        removeStoredFile(existingSubmission.submit_file);
      }
      submitFileValue = '';
    }

    const safeContent = sanitizeHtml(submit_content || '');

    let result;
    if (existingSubmission) {
      // 重新提交后清空上一次的审核结论，避免旧的评语/审核时间残留
      result = await runQuery(
        `UPDATE submissions SET submit_content = ?, submit_file = ?, check_status = 'pending', check_remark = NULL, check_time = NULL
         WHERE id = ?`,
        [safeContent, submitFileValue, existingSubmission.id]
      );
      result.lastID = existingSubmission.id;
    } else {
      result = await runQuery(
        `INSERT INTO submissions (task_id, student_id, submit_content, submit_file, week_number)
         VALUES (?, ?, ?, ?, ?)`,
        [taskId, req.user.id, safeContent, submitFileValue, weekNum]
      );
    }

    const newSubmission = await getQuery('SELECT * FROM submissions WHERE id = ?', [result.lastID]);
    res.status(201).json(decorateSubmission(newSubmission));
  } catch (err) {
    console.error('提交错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/review', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const { check_status, check_remark } = req.body;

    if (!REVIEW_STATUSES.includes(check_status)) {
      return res.status(400).json({ error: '审核状态不合法' });
    }

    const submission = await getQuery('SELECT * FROM submissions WHERE id = ?', [req.params.id]);
    if (!submission) {
      return res.status(404).json({ error: '提交不存在' });
    }

    // 越权审核防护：只能审核自己名下任务的提交
    const ownedTask = await getQuery('SELECT id FROM tasks WHERE id = ? AND teacher_id = ?', [submission.task_id, req.user.id]);
    if (!ownedTask) {
      return res.status(403).json({ error: '无权审核该提交' });
    }

    const safeRemark = sanitizeHtml(check_remark || '');
    const remarkSummary = summarizeHtml(safeRemark);

    await runQuery(
      `UPDATE submissions SET check_status = ?, check_remark = ?, check_time = CURRENT_TIMESTAMP WHERE id = ?`,
      [check_status, safeRemark, req.params.id]
    );

    const task = await getQuery('SELECT title FROM tasks WHERE id = ?', [submission.task_id]);
    const statusText = check_status === 'approved' ? '通过' : (check_status === 'rejected' ? '未通过' : '待审核');
    
    await createNotification(
      submission.student_id,
      'review_result',
      '审核结果通知',
      `您的「${task?.title || '任务'}」提交已${statusText}${remarkSummary ? '，评语：' + remarkSummary : ''}`,
      submission.task_id
    );

    const student = await getQuery('SELECT student_email FROM users WHERE id = ?', [submission.student_id]);
    if (student?.student_email) {
      await sendReviewResultEmail(student.student_email, task?.title || '任务', check_status, safeRemark);
    }

    const updatedSubmission = await getQuery('SELECT * FROM submissions WHERE id = ?', [req.params.id]);
    res.json(decorateSubmission(updatedSubmission));
  } catch (err) {
    console.error('保存评价失败:', err);
    res.status(500).json({ error: '服务器错误: ' + err.message });
  }
});

router.post('/batch-review', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const { check_status, check_remark } = req.body;

    if (!REVIEW_STATUSES.includes(check_status)) {
      return res.status(400).json({ error: '审核状态不合法' });
    }

    const submissionIds = normalizeIdArray(req.body.submission_ids);
    if (!submissionIds || submissionIds.length === 0) {
      return res.status(400).json({ error: '请选择要审核的提交记录' });
    }

    const statusText = check_status === 'approved' ? '通过' : (check_status === 'rejected' ? '未通过' : '待审核');
    const safeRemark = sanitizeHtml(check_remark || '');
    const remarkSummary = summarizeHtml(safeRemark);

    let updatedCount = 0;
    for (const id of submissionIds) {
      const submission = await getQuery(
        `SELECT s.* FROM submissions s
         JOIN tasks t ON s.task_id = t.id
         WHERE s.id = ? AND t.teacher_id = ?`,
        [id, req.user.id]
      );
      if (!submission) continue;

      await runQuery(
        `UPDATE submissions SET check_status = ?, check_remark = ?, check_time = CURRENT_TIMESTAMP WHERE id = ?`,
        [check_status, safeRemark, id]
      );
      updatedCount++;

      const task = await getQuery('SELECT title FROM tasks WHERE id = ?', [submission.task_id]);
      await createNotification(
        submission.student_id,
        'review_result',
        '审核结果通知',
        `您的「${task?.title || '任务'}」提交已${statusText}${remarkSummary ? '，评语：' + remarkSummary : ''}`,
        submission.task_id
      );

      const student = await getQuery('SELECT student_email FROM users WHERE id = ?', [submission.student_id]);
      if (student?.student_email) {
        await sendReviewResultEmail(student.student_email, task?.title || '任务', check_status, safeRemark);
      }
    }

    res.json({ message: `批量审核成功，共处理 ${updatedCount} 条`, updatedCount });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
