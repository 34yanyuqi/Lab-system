const { runQuery } = require('../database');

async function createNotification(user_id, type, title, content, related_id = null) {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const localTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    await runQuery(
      'INSERT INTO notifications (user_id, type, title, content, related_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, type, title, content, related_id, localTime]
    );
  } catch (err) {
    console.error('创建通知错误:', err);
  }
}

module.exports = { createNotification };
