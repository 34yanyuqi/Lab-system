const { getQuery } = require('../database');

async function requireEmailVerification(req, res, next) {
  try {
    const user = await getQuery('SELECT email_verified, teacher_email, student_email, role FROM users WHERE id = ?', [req.user.id]);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const email = user.role === 'teacher' ? user.teacher_email : user.student_email;
    
    if (!email) {
      return res.status(403).json({
        success: false,
        error: '请先在个人中心绑定邮箱',
        message: '请先在个人中心绑定邮箱',
        code: 'EMAIL_NOT_BOUND',
        needEmail: true
      });
    }

    if (user.email_verified !== 1) {
      return res.status(403).json({
        success: false,
        error: '请先完成邮箱验证',
        message: '请先完成邮箱验证',
        code: 'EMAIL_NOT_VERIFIED',
        needActivation: true,
        email
      });
    }

    next();
  } catch (err) {
    console.error('邮箱验证检查错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
}

module.exports = { requireEmailVerification };
