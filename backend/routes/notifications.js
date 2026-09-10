const express = require('express');
const { runQuery, getQuery, allQuery } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');

const router = express.Router();

router.use(authMiddleware);
router.use(requireEmailVerification);

router.get('/', async (req, res) => {
  try {
    const notifications = await allQuery(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(notifications);
  } catch (err) {
    console.error('获取通知列表错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const result = await getQuery(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ unreadCount: result?.count || 0 });
  } catch (err) {
    console.error('获取未读通知数错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '通知ID不合法' });
    }
    await runQuery(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    res.json({ message: '已标记为已读' });
  } catch (err) {
    console.error('标记通知已读错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await runQuery(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ message: '所有通知已标记为已读' });
  } catch (err) {
    console.error('标记所有通知已读错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '通知ID不合法' });
    }
    await runQuery(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除通知错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = { router };