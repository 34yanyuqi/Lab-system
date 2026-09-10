const express = require('express');
const bcrypt = require('bcryptjs');
const { sendActivationEmail, sendVerificationCode, verifyCode, verifyActivationCode } = require('../utils/email');
const { authMiddleware } = require('../middleware/auth');
const { runQuery, getQuery } = require('../database');
const { isValidEmail } = require('../utils/sanitize');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// 验证码邮件发送限流，避免被当作邮件轰炸工具
const codeLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 10, message: '验证码发送过于频繁，请稍后再试' });

const ALLOWED_CODE_TYPES = ['change_email', 'change_password', 'bind_email'];

function validateEmailParam(email) {
  if (!email) return '请提供邮箱地址';
  if (!isValidEmail(email)) return '邮箱格式不正确';
  return null;
}

router.post('/send-verification', codeLimiter, authMiddleware, async (req, res) => {
  try {
    const { email, type = 'change_email' } = req.body;

    const emailError = validateEmailParam(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    if (!ALLOWED_CODE_TYPES.includes(type)) {
      return res.status(400).json({ error: '验证码类型不合法' });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (type === 'change_email' && currentEmail && email !== currentEmail) {
      return res.status(400).json({ error: '只能向当前绑定的邮箱发送验证码' });
    }

    const result = await sendVerificationCode(email, req.user.id, type);
    
    if (result.success) {
      res.json({ message: '验证码已发送，请查收邮件' });
    } else {
      res.status(500).json({ error: '发送失败：' + result.error });
    }
  } catch (err) {
    console.error('发送验证码错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/bind', authMiddleware, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (currentEmail) {
      return res.status(400).json({ error: '用户已绑定邮箱，请使用更换邮箱功能' });
    }

    const verifyResult = await verifyCode(email, code, 'bind_email');
    
    if (!verifyResult.valid) {
      return res.status(400).json({ error: verifyResult.message });
    }

    const emailField = user.role === 'teacher' ? 'teacher_email' : 'student_email';
    
    await runQuery(
      `UPDATE users SET ${emailField} = ?, email_verified = 1 WHERE id = ?`,
      [email, req.user.id]
    );

    res.json({ message: '邮箱绑定成功' });
  } catch (err) {
    console.error('绑定邮箱错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/send-bind-code', codeLimiter, authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;

    const emailError = validateEmailParam(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (currentEmail) {
      return res.status(400).json({ error: '用户已绑定邮箱，请使用更换邮箱功能' });
    }

    const result = await sendVerificationCode(email, req.user.id, 'bind_email');
    
    if (result.success) {
      res.json({ message: '验证码已发送，请查收邮件' });
    } else {
      res.status(500).json({ error: '发送失败：' + result.error });
    }
  } catch (err) {
    console.error('发送绑定验证码错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/change', authMiddleware, async (req, res) => {
  try {
    const { old_email, code, new_email } = req.body;

    if (!old_email || !code || !new_email) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (!isValidEmail(new_email)) {
      return res.status(400).json({ error: '新邮箱格式不正确' });
    }

    const verifyResult = await verifyCode(old_email, code, 'change_email');
    
    if (!verifyResult.valid) {
      return res.status(400).json({ error: verifyResult.message });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (old_email !== currentEmail) {
      return res.status(400).json({ error: '原邮箱不正确' });
    }

    const emailField = user.role === 'teacher' ? 'teacher_email' : 'student_email';
    
    await runQuery(
      `UPDATE users SET ${emailField} = ?, email_verified = 0 WHERE id = ?`,
      [new_email, req.user.id]
    );

    const result = await sendActivationEmail(new_email, req.user.id, user.role);
    
    if (result.success) {
      res.json({ message: '邮箱已更换，请前往新邮箱完成验证' });
    } else {
      res.status(500).json({ error: '发送验证邮件失败：' + result.error });
    }
  } catch (err) {
    console.error('更换邮箱错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/activate', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const verifyResult = await verifyCode(email, code, 'activation');
    
    if (!verifyResult.valid) {
      return res.status(400).json({ error: verifyResult.message });
    }

    await runQuery(
      'UPDATE users SET email_verified = 1 WHERE id = ?',
      [verifyResult.userId]
    );

    res.json({ message: '邮箱验证成功，账号已激活' });
  } catch (err) {
    console.error('激活账号错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// 公开接口：激活页在未登录状态下需要重新发送验证码
router.post('/resend-activation', codeLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    const emailError = validateEmailParam(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const user = await getQuery(
      'SELECT * FROM users WHERE (teacher_email = ? OR student_email = ?) LIMIT 1',
      [email, email]
    );

    if (user && user.email_verified !== 1) {
      const result = await sendActivationEmail(email, user.id, user.role);
      if (!result.success) {
        return res.status(500).json({ error: '发送失败，请稍后重试' });
      }
    }

    // 无论邮箱是否存在都返回相同结果，避免邮箱枚举
    res.json({ message: '若该邮箱存在且尚未激活，激活验证码已重新发送' });
  } catch (err) {
    console.error('重新发送激活邮件错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/send-activation', authMiddleware, async (req, res) => {
  try {
    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const email = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (!email) {
      return res.status(400).json({ error: '用户未设置邮箱' });
    }

    const result = await sendActivationEmail(email, req.user.id, user.role);
    
    if (result.success) {
      res.json({ message: '激活邮件已发送，请查收邮件完成激活' });
    } else {
      res.status(500).json({ error: '发送失败：' + result.error });
    }
  } catch (err) {
    console.error('发送激活邮件错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { email, code, new_password } = req.body;

    if (!email || !code || !new_password) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    if (typeof new_password !== 'string' || new_password.length < 6 || new_password.length > 128) {
      return res.status(400).json({ error: '新密码长度需为6-128个字符' });
    }

    const verifyResult = await verifyCode(email, code, 'change_password');
    
    if (!verifyResult.valid) {
      return res.status(400).json({ error: verifyResult.message });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (email !== currentEmail) {
      return res.status(400).json({ error: '邮箱不正确' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    await runQuery(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/send-password-code', codeLimiter, authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;

    const emailError = validateEmailParam(email);
    if (emailError) {
      return res.status(400).json({ error: emailError });
    }

    const user = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const currentEmail = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (email !== currentEmail) {
      return res.status(400).json({ error: '邮箱地址不正确' });
    }

    const result = await sendVerificationCode(email, req.user.id, 'change_password');
    
    if (result.success) {
      res.json({ message: '验证码已发送，请查收邮件' });
    } else {
      res.status(500).json({ error: '发送失败：' + result.error });
    }
  } catch (err) {
    console.error('发送密码修改验证码错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
