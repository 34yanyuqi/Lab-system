const express = require('express');
const bcrypt = require('bcryptjs');
const { runQuery, getQuery } = require('../database');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { captchaStore } = require('../utils/captchaStore');
const { sendActivationEmail } = require('../utils/email');
const { verifyCode } = require('../utils/email');
const { createRateLimiter } = require('../middleware/rateLimit');
const { isNonEmptyString, isValidEmail } = require('../utils/sanitize');

const router = express.Router();

// 认证类接口限流，缓解暴力破解
const loginLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, message: '登录尝试过于频繁，请5分钟后再试' });
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: '注册过于频繁，请稍后再试' });

const ALLOWED_ROLES = ['teacher', 'student'];

function consumeCaptcha(captchaId, captchaText) {
  if (!captchaId || !captchaText) return { ok: false, error: '缺少验证码参数' };
  const storedCaptcha = captchaStore.get(captchaId);
  if (!storedCaptcha) return { ok: false, error: '验证码已过期' };
  if (storedCaptcha !== String(captchaText).toLowerCase()) return { ok: false, error: '验证码错误' };
  captchaStore.delete(captchaId);
  return { ok: true };
}

router.post('/pin-login', loginLimiter, async (req, res) => {
  try {
    const { pin } = req.body;

    if (!pin || !/^\d{8,12}$/.test(pin)) {
      return res.status(400).json({ error: '请输入8-12位颜色码' });
    }

    const user = await getQuery(
      'SELECT * FROM users WHERE pin = ?',
      [pin]
    );

    if (!user) {
      return res.status(401).json({ error: '快捷密码错误或未设置' });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword
    });
  } catch (err) {
    console.error('PIN登录错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, captchaId, captchaText } = req.body;

    if (!isNonEmptyString(username, 100) || !isNonEmptyString(password, 128)) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const captchaResult = consumeCaptcha(captchaId, captchaText);
    if (!captchaResult.ok) {
      return res.status(400).json({ error: captchaResult.error });
    }

    let user = await getQuery(
      'SELECT * FROM users WHERE username = ? OR student_id = ?',
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    const email = user.role === 'teacher' ? user.teacher_email : user.student_email;
    const emailVerified = user.email_verified === 1;

    res.json({
      token,
      user: userWithoutPassword,
      emailVerified,
      hasEmail: !!email,
      needEmail: !email,
      needActivation: email && !emailVerified
    });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { role, username, password, captchaId, captchaText, ...userData } = req.body;

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: '角色类型不合法' });
    }

    if (!isNonEmptyString(username, 50)) {
      return res.status(400).json({ error: '用户名不能为空且不超过50个字符' });
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: '密码长度需为6-128个字符' });
    }

    const email = role === 'teacher' ? userData.teacher_email : userData.student_email;
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const captchaResult = consumeCaptcha(captchaId, captchaText);
    if (!captchaResult.ok) {
      return res.status(400).json({ error: captchaResult.error });
    }

    const existingUser = await getQuery(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    if (role === 'student' && userData.student_id) {
      const existingStudentId = await getQuery(
        'SELECT id FROM users WHERE student_id = ?',
        [userData.student_id]
      );
      if (existingStudentId) {
        return res.status(400).json({ error: '学号已存在' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await runQuery(
      `INSERT INTO users (role, username, password, teacher_name, teacher_email, teacher_phone, student_id, student_grade, student_major, student_email, graduate_year, lab_room, monitor1_sn, monitor2_sn, computer_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        role,
        username,
        hashedPassword,
        userData.teacher_name || null,
        userData.teacher_email || null,
        userData.teacher_phone || null,
        userData.student_id || null,
        userData.student_grade || null,
        userData.student_major || null,
        userData.student_email || null,
        userData.graduate_year || null,
        userData.lab_room || null,
        userData.monitor1_sn || null,
        userData.monitor2_sn || null,
        userData.computer_info || null
      ]
    );

    const newUser = await getQuery('SELECT * FROM users WHERE id = ?', [result.lastID]);
    const token = generateToken(newUser);
    const { password: _, ...userWithoutPassword } = newUser;

    if (email) {
      const mailResult = await sendActivationEmail(email, result.lastID, role);
      if (!mailResult.success) {
        // 注册已成功，邮件失败不影响账号创建，但需要记录日志便于排查
        console.error('注册激活邮件发送失败:', mailResult.error);
      }
    }

    res.status(201).json({
      token,
      user: userWithoutPassword,
      emailSent: !!email
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/pin', authMiddleware, async (req, res) => {
  try {
    const { pin, emailCode } = req.body;

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const email = user.role === 'teacher' ? user.teacher_email : user.student_email;
    if (!email) {
      return res.status(400).json({ error: '请先绑定邮箱' });
    }

    if (!emailCode) {
      return res.status(400).json({ error: '请输入邮箱验证码' });
    }

    const verifyResult = await verifyCode(email, emailCode, 'set_pin');
    if (!verifyResult.valid) {
      return res.status(400).json({ error: verifyResult.message || '验证码错误或已过期' });
    }

    if (!pin || !/^[0-9]{8,12}$/.test(pin)) {
      return res.status(400).json({ error: '颜色码必须为8-12位数字（0-9）' });
    }

    const existing = await getQuery('SELECT id FROM users WHERE pin = ? AND id != ?', [pin, req.user.id]);
    if (existing) {
      return res.status(400).json({ error: '此PIN已被其他用户使用' });
    }

    await runQuery('UPDATE users SET pin = ? WHERE id = ?', [pin, req.user.id]);
    res.json({ message: 'PIN设置成功' });
  } catch (err) {
    console.error('PIN设置错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json({ ...userWithoutPassword, hasPin: !!user.pin });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const currentUser = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const {
      username,
      teacher_name,
      teacher_phone,
      student_id,
      student_grade,
      student_major,
      graduate_year,
      student_phone,
      student_id_card,
      student_bank_card,
      student_bank_name,
      lab_room,
      monitor1_sn,
      monitor2_sn,
      computer_info
    } = req.body;

    if (username && username !== currentUser.username) {
      const usernameConflict = await getQuery('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.id]);
      if (usernameConflict) {
        return res.status(400).json({ error: '用户名已存在' });
      }
    }

    if (currentUser.role === 'teacher') {
      await runQuery(
        `UPDATE users
         SET username = ?, teacher_name = ?, teacher_phone = ?
         WHERE id = ?`,
        [
          username ?? currentUser.username,
          teacher_name ?? currentUser.teacher_name,
          teacher_phone ?? currentUser.teacher_phone,
          req.user.id
        ]
      );
    } else {
      const studentIdConflict = student_id
        ? await getQuery('SELECT id FROM users WHERE student_id = ? AND id != ?', [student_id, req.user.id])
        : null;

      if (studentIdConflict) {
        return res.status(400).json({ error: '学号已存在' });
      }

      await runQuery(
        `UPDATE users
         SET username = ?, student_id = ?, student_grade = ?, student_major = ?, graduate_year = ?, student_phone = ?, student_id_card = ?, student_bank_card = ?, student_bank_name = ?, lab_room = ?, monitor1_sn = ?, monitor2_sn = ?, computer_info = ?
         WHERE id = ?`,
        [
          username ?? currentUser.username,
          student_id ?? currentUser.student_id,
          student_grade ?? currentUser.student_grade,
          student_major ?? currentUser.student_major,
          graduate_year ?? currentUser.graduate_year,
          student_phone ?? currentUser.student_phone,
          student_id_card ?? currentUser.student_id_card,
          student_bank_card ?? currentUser.student_bank_card,
          student_bank_name ?? currentUser.student_bank_name,
          lab_room ?? currentUser.lab_room,
          monitor1_sn ?? currentUser.monitor1_sn,
          monitor2_sn ?? currentUser.monitor2_sn,
          computer_info ?? currentUser.computer_info,
          req.user.id
        ]
      );
    }

    const updatedUser = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (err) {
    console.error('更新个人信息错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
