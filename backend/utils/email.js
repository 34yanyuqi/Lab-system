const nodemailer = require('nodemailer');
const crypto = require('crypto');
const config = require('../config');
const { runQuery, getQuery } = require('../database');

const transporter = nodemailer.createTransport({
  ...config.email.smtp,
  tls: {
    // 默认开启证书校验，仅在显式配置 SMTP_TLS_REJECT_UNAUTHORIZED=false 时关闭
    rejectUnauthorized: config.email.tlsRejectUnauthorized
  },
  authMethod: 'LOGIN'
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP配置验证失败:', error.message);
  } else {
    console.log('SMTP配置验证成功，可以发送邮件');
  }
});

function generateVerificationCode(length = 6) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    // 使用加密安全随机数，避免 Math.random 可预测导致的验证码被猜测
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return code;
}

/**
 * 写入验证码前先作废该邮箱同类型的旧验证码，
 * 否则旧验证码在有效期内依然可用（email_codes 表没有唯一约束）。
 */
async function upsertEmailCode(email, code, userId, type, expiresAt) {
  await runQuery('DELETE FROM email_codes WHERE email = ? AND type = ?', [email, type]);
  await runQuery(
    'INSERT INTO email_codes (email, code, user_id, type, expires_at) VALUES (?, ?, ?, ?, ?)',
    [email, code, userId, type, expiresAt]
  );
}

async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html
    });
    console.log('邮件发送成功:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('邮件发送失败:', error);
    return { success: false, error: error.message };
  }
}

async function sendActivationEmail(email, userId, role) {
  const code = generateVerificationCode(6);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  await upsertEmailCode(email, code, userId, 'activation', expiresAt);

  const subject = '账号激活验证码';
  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2>账号激活</h2>
      <p>尊敬的用户，您的账号需要激活才能使用。</p>
      <p>您的激活验证码是：</p>
      <p style="font-size: 24px; font-weight: bold; color: #007bff;">${code}</p>
      <p>验证码有效期30分钟，请尽快登录系统完成激活。</p>
      <p>如果这不是您的操作，请忽略此邮件。</p>
    </div>
  `;

  return await sendEmail(email, subject, html);
}

async function sendVerificationCode(email, userId, type = 'change_email') {
  const code = generateVerificationCode(6);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  await upsertEmailCode(email, code, userId, type, expiresAt);

  const subject = type === 'change_email' ? '邮箱更换验证码' : '邮箱验证码';
  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2>${subject}</h2>
      <p>您的验证码是：</p>
      <p style="font-size: 24px; font-weight: bold; color: #007bff;">${code}</p>
      <p>验证码有效期30分钟，请尽快使用。</p>
      <p>如果这不是您的操作，请忽略此邮件。</p>
    </div>
  `;

  return await sendEmail(email, subject, html);
}

async function sendTaskNotificationEmail(studentEmail, taskTitle, taskContent) {
  const subject = '新任务通知';
  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2>新任务通知</h2>
      <p>尊敬的同学，您有一个新任务需要完成：</p>
      <h3>${taskTitle}</h3>
      <p>任务内容：${taskContent}</p>
      <p>请登录系统查看详细信息并完成任务。</p>
    </div>
  `;

  return await sendEmail(studentEmail, subject, html);
}

async function sendReviewResultEmail(studentEmail, taskTitle, status, remark) {
  const statusText = status === 'approved' ? '通过' : (status === 'rejected' ? '未通过' : '待审核');
  const subject = `任务审核结果通知 - ${statusText}`;
  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2>任务审核结果</h2>
      <p>尊敬的同学，您提交的任务「${taskTitle}」审核结果如下：</p>
      <p>审核状态：<strong>${statusText}</strong></p>
      ${remark ? `<p>审核评语：${remark}</p>` : ''}
      <p>请登录系统查看详细信息。</p>
    </div>
  `;

  return await sendEmail(studentEmail, subject, html);
}

async function verifyCode(email, code, type) {
  if (!email || !code || !type) {
    return { valid: false, message: '验证码参数不完整' };
  }

  const record = await getQuery(
    'SELECT * FROM email_codes WHERE email = ? AND code = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
    [email, String(code).toUpperCase(), type]
  );

  if (!record) {
    return { valid: false, message: '验证码不正确' };
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  
  if (now > expiresAt) {
    await runQuery('DELETE FROM email_codes WHERE id = ?', [record.id]);
    return { valid: false, message: '验证码已过期' };
  }

  await runQuery('DELETE FROM email_codes WHERE id = ?', [record.id]);
  return { valid: true, message: '验证成功', userId: record.user_id };
}

async function verifyActivationCode(code) {
  if (!code) {
    return { valid: false, message: '激活链接无效' };
  }

  const record = await getQuery(
    'SELECT * FROM email_codes WHERE code = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
    [String(code).toUpperCase(), 'activation']
  );

  if (!record) {
    return { valid: false, message: '激活链接无效' };
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  
  if (now > expiresAt) {
    await runQuery('DELETE FROM email_codes WHERE id = ?', [record.id]);
    return { valid: false, message: '激活链接已过期' };
  }

  await runQuery('DELETE FROM email_codes WHERE id = ?', [record.id]);
  return { valid: true, message: '激活成功', userId: record.user_id, email: record.email };
}

module.exports = {
  sendEmail,
  sendActivationEmail,
  sendVerificationCode,
  sendTaskNotificationEmail,
  sendReviewResultEmail,
  verifyCode,
  verifyActivationCode,
  generateVerificationCode
};
