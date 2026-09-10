const express = require('express');
const bcrypt = require('bcryptjs');
const { getQuery, allQuery, runQuery, db } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');
const { normalizeIdArray } = require('../utils/sanitize');

const router = express.Router();

/** 以事务方式删除学生及其全部关联数据，避免留下孤儿记录 */
async function deleteStudentsCascade(studentIds) {
  if (!studentIds.length) return 0;
  const placeholders = studentIds.map(() => '?').join(',');

  await runQuery('BEGIN IMMEDIATE');
  try {
    // 从任务的 student_ids JSON 中移除
    const tasks = await allQuery('SELECT id, student_ids FROM tasks');
    for (const task of tasks) {
      let studentIdsInTask = [];
      try {
        const parsed = JSON.parse(task.student_ids || '[]');
        studentIdsInTask = Array.isArray(parsed) ? parsed : [];
      } catch {
        studentIdsInTask = [];
      }
      const nextIds = studentIdsInTask.filter(id => !studentIds.includes(Number(id)));
      if (nextIds.length !== studentIdsInTask.length) {
        await runQuery('UPDATE tasks SET student_ids = ? WHERE id = ?', [JSON.stringify(nextIds), task.id]);
      }
    }

    await runQuery(`DELETE FROM ai_chat_history WHERE submission_id IN (SELECT id FROM submissions WHERE student_id IN (${placeholders}))`, studentIds);
    await runQuery(`DELETE FROM submissions WHERE student_id IN (${placeholders})`, studentIds);
    await runQuery(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, studentIds);
    await runQuery(`DELETE FROM attendance_permissions WHERE student_id IN (${placeholders})`, studentIds);
    await runQuery(`DELETE FROM email_codes WHERE user_id IN (${placeholders})`, studentIds);
    await runQuery(`DELETE FROM project_members WHERE student_id IN (${placeholders})`, studentIds);
    const result = await runQuery(`DELETE FROM users WHERE id IN (${placeholders}) AND role = 'student'`, studentIds);

    await runQuery('COMMIT');
    return result.changes;
  } catch (err) {
    try { await runQuery('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

router.use(authMiddleware);
router.use(requireEmailVerification);

router.get('/students', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const students = await allQuery(
      `SELECT id, username, student_id, student_grade, student_major, student_email, graduate_year, 
              student_phone, student_id_card, student_bank_card, student_bank_name, create_time
       FROM users WHERE role = ?`,
      ['student']
    );
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/students', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const {
      username,
      password,
      student_id,
      student_grade,
      student_major,
      student_email,
      graduate_year
    } = req.body;

    const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const existingStudentId = await getQuery('SELECT id FROM users WHERE student_id = ?', [student_id]);
    if (existingStudentId) {
      return res.status(400).json({ error: '学号已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await runQuery(
      `INSERT INTO users (role, username, password, student_id, student_grade, student_major, student_email, graduate_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['student', username, hashedPassword, student_id, student_grade, student_major, student_email, graduate_year]
    );

    const newStudent = await getQuery(
      `SELECT id, username, student_id, student_grade, student_major, student_email, graduate_year, 
              student_phone, student_id_card, student_bank_card, student_bank_name, create_time
       FROM users WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json(newStudent);
  } catch (err) {
    console.error('创建学生错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/students/:id', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const student = await getQuery('SELECT * FROM users WHERE id = ? AND role = ?', [req.params.id, 'student']);
    if (!student) {
      return res.status(404).json({ error: '学生不存在' });
    }

    const allowedFields = ['username', 'student_id', 'student_grade', 'student_major', 'student_email', 'graduate_year', 'student_phone', 'student_id_card', 'student_bank_card', 'student_bank_name'];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'username') {
          const conflict = await getQuery('SELECT id FROM users WHERE username = ? AND id != ?', [req.body.username, req.params.id]);
          if (conflict) return res.status(400).json({ error: '用户名已存在' });
        }
        if (field === 'student_id') {
          const conflict = await getQuery('SELECT id FROM users WHERE student_id = ? AND id != ?', [req.body.student_id, req.params.id]);
          if (conflict) return res.status(400).json({ error: '学号已存在' });
        }
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (req.body.password) {
      updates.push('password = ?');
      values.push(await bcrypt.hash(req.body.password, 10));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    values.push(req.params.id, 'student');
    await runQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND role = ?`, values);

    const updatedStudent = await getQuery(
      `SELECT id, username, student_id, student_grade, student_major, student_email, graduate_year, 
              student_phone, student_id_card, student_bank_card, student_bank_name, create_time
       FROM users WHERE id = ?`,
      [req.params.id]
    );

    res.json(updatedStudent);
  } catch (err) {
    console.error('更新学生错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/students/:id', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ error: '学生ID不合法' });
    }

    const student = await getQuery('SELECT id FROM users WHERE id = ? AND role = ?', [studentId, 'student']);
    if (!student) {
      return res.status(404).json({ error: '学生不存在' });
    }

    await deleteStudentsCascade([studentId]);

    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除学生错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/students/batch-delete', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const numIds = normalizeIdArray(req.body.ids);
    if (!numIds || numIds.length === 0) {
      return res.status(400).json({ error: '请选择要删除的学生' });
    }

    const deleted = await deleteStudentsCascade(numIds);

    res.json({ message: `成功删除 ${deleted} 名学生` });
  } catch (err) {
    console.error('批量删除学生错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const teachers = await allQuery(
      `SELECT id, username, teacher_name, teacher_email, teacher_phone 
       FROM users WHERE role = ?`,
      ['teacher']
    );
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const totalTasks = await getQuery(
      'SELECT COUNT(*) as count FROM tasks WHERE teacher_id = ?',
      [req.user.id]
    );

    const activeTasks = await getQuery(
      'SELECT COUNT(*) as count FROM tasks WHERE teacher_id = ? AND status = ?',
      [req.user.id, 'active']
    );

    const totalSubmissions = await getQuery(`
      SELECT COUNT(*) as count FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      WHERE t.teacher_id = ?
    `, [req.user.id]);

    const pendingSubmissions = await getQuery(`
      SELECT COUNT(*) as count FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      WHERE t.teacher_id = ? AND s.check_status = ?
    `, [req.user.id, 'pending']);

    const approvedSubmissions = await getQuery(`
      SELECT COUNT(*) as count FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      WHERE t.teacher_id = ? AND s.check_status = ?
    `, [req.user.id, 'approved']);

    // 只统计该教师名下任务的提交，避免跨教师数据泄露
    const studentStats = await allQuery(`
      SELECT u.id, u.student_id, u.student_major,
             COUNT(DISTINCT s.id) as total_submissions,
             SUM(CASE WHEN s.check_status = 'approved' THEN 1 ELSE 0 END) as approved_count
      FROM users u
      LEFT JOIN submissions s ON u.id = s.student_id
        AND s.task_id IN (SELECT id FROM tasks WHERE teacher_id = ?)
      WHERE u.role = ?
      GROUP BY u.id
    `, [req.user.id, 'student']);

    res.json({
      totalTasks: totalTasks.count,
      activeTasks: activeTasks.count,
      totalSubmissions: totalSubmissions.count,
      pendingSubmissions: pendingSubmissions.count,
      approvedSubmissions: approvedSubmissions.count,
      studentStats
    });
  } catch (err) {
    console.error('统计错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/student-overview', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const totalStudents = await getQuery(
      'SELECT COUNT(*) as count FROM users WHERE role = ?',
      ['student']
    );

    const gradeStats = await allQuery(
      'SELECT student_grade, COUNT(*) as count FROM users WHERE role = ? GROUP BY student_grade ORDER BY student_grade',
      ['student']
    );

    const majorStats = await allQuery(
      'SELECT student_major, COUNT(*) as count FROM users WHERE role = ? GROUP BY student_major ORDER BY count DESC',
      ['student']
    );

    const gradeMajorStats = await allQuery(
      'SELECT student_grade, student_major, COUNT(*) as count FROM users WHERE role = ? GROUP BY student_grade, student_major ORDER BY student_grade, student_major',
      ['student']
    );

    res.json({
      totalStudents: totalStudents.count,
      gradeStats,
      majorStats,
      gradeMajorStats
    });
  } catch (err) {
    console.error('学生概览统计错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/weekly-stats', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const tasks = await allQuery(
      'SELECT id, title, create_time, end_date, student_ids, status FROM tasks WHERE teacher_id = ? ORDER BY create_time ASC',
      [req.user.id]
    );

    const submissions = await allQuery(`
      SELECT s.task_id, s.student_id, s.submit_time
      FROM submissions s
      JOIN tasks t ON s.task_id = t.id
      WHERE t.teacher_id = ?
    `, [req.user.id]);

    res.json({ tasks, submissions });
  } catch (err) {
    console.error('周统计错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/majors', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT DISTINCT student_major FROM users WHERE role = 'student' AND student_major IS NOT NULL AND student_major != '' ORDER BY student_major`
    );
    res.json(rows.map(r => r.student_major));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/grades', async (req, res) => {
  try {
    const rows = await allQuery(
      `SELECT DISTINCT student_grade FROM users WHERE role = 'student' AND student_grade IS NOT NULL AND student_grade != '' ORDER BY student_grade`
    );
    res.json(rows.map(r => r.student_grade));
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
