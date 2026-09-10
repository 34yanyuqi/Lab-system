const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, getQuery, allQuery } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');
const { isNonEmptyString, toPositiveInt, normalizeIdArray } = require('../utils/sanitize');

const router = express.Router();

const equipmentImageDir = path.join(__dirname, '..', 'uploads', 'equipments', 'images');
fs.mkdirSync(equipmentImageDir, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, equipmentImageDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只支持PNG、JPEG、WebP和GIF格式的图片'), false);
    }
  }
});

/** 删除设备图片文件，忽略不存在的文件 */
function removeEquipmentImageFile(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/equipments/images/')) return;
  const fileName = path.basename(imageUrl);
  const absolutePath = path.join(equipmentImageDir, fileName);
  if (fs.existsSync(absolutePath)) {
    try { fs.unlinkSync(absolutePath); } catch { /* 忽略清理失败 */ }
  }
}

router.use(authMiddleware);
router.use(requireEmailVerification);

router.get('/', async (req, res) => {
  try {
    const { student_school_id, category } = req.query;
    let sql = 'SELECT * FROM equipments WHERE 1=1';
    const params = [];

    if (student_school_id) {
      sql += ' AND student_school_id = ?';
      params.push(student_school_id);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY id DESC';
    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('获取设备列表错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/borrow', async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '无权操作' });
    }

    // 从数据库获取完整的用户信息
    const currentUser = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const equipmentId = toPositiveInt(req.params.id);
    if (!equipmentId) {
      return res.status(400).json({ error: '设备ID不合法' });
    }

    const equipment = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    if (!equipment) {
      return res.status(404).json({ error: '设备不存在' });
    }

    if (!currentUser.student_id) {
      return res.status(400).json({ error: '请先在个人信息中填写学号' });
    }

    if (equipment.student_school_id && equipment.student_school_id !== currentUser.student_id) {
      return res.status(400).json({ error: '该设备已被其他学生领用' });
    }

    await runQuery(
      'UPDATE equipments SET student_school_id = ?, student_name = ? WHERE id = ?',
      [currentUser.student_id, currentUser.username, equipmentId]
    );
    const updated = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    res.json(updated);
  } catch (err) {
    console.error('领用设备错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id/return', async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: '无权操作' });
    }

    // 从数据库获取完整的用户信息
    const currentUser = await getQuery('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const equipmentId = toPositiveInt(req.params.id);
    if (!equipmentId) {
      return res.status(400).json({ error: '设备ID不合法' });
    }

    const equipment = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    if (!equipment) {
      return res.status(404).json({ error: '设备不存在' });
    }

    if (!currentUser.student_id || equipment.student_school_id !== currentUser.student_id) {
      return res.status(400).json({ error: '您没有领用该设备' });
    }

    await runQuery(
      'UPDATE equipments SET student_school_id = NULL, student_name = NULL WHERE id = ?',
      [equipmentId]
    );
    const updated = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    res.json(updated);
  } catch (err) {
    console.error('归还设备错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/:id/upload-image', imageUpload.single('equipment_image'), async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const equipmentId = toPositiveInt(req.params.id);
    if (!equipmentId) {
      return res.status(400).json({ error: '设备ID不合法' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const equipment = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    if (!equipment) {
      return res.status(404).json({ error: '设备不存在' });
    }

    const imageUrl = `/uploads/equipments/images/${req.file.filename}`;
    removeEquipmentImageFile(equipment.image_url);
    await runQuery('UPDATE equipments SET image_url = ? WHERE id = ?', [imageUrl, equipmentId]);

    const updated = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    res.json(updated);
  } catch (err) {
    console.error('上传设备图片错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id/image', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const equipmentId = toPositiveInt(req.params.id);
    if (!equipmentId) {
      return res.status(400).json({ error: '设备ID不合法' });
    }

    const equipment = await getQuery('SELECT * FROM equipments WHERE id = ?', [equipmentId]);
    if (!equipment) {
      return res.status(404).json({ error: '设备不存在' });
    }

    removeEquipmentImageFile(equipment.image_url);
    await runQuery('UPDATE equipments SET image_url = NULL WHERE id = ?', [equipmentId]);

    res.json({ success: true, message: '图片已删除' });
  } catch (err) {
    console.error('删除设备图片错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await getQuery('SELECT * FROM equipments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: '设备不存在' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    const { category, school_code, serial_number, name, value, model, teacher_name, student_school_id, student_name, location, purchase_date } = req.body;
    if (!isNonEmptyString(category, 50) || !isNonEmptyString(name, 200)) {
      return res.status(400).json({ error: '类别和设备名称为必填项' });
    }
    const result = await runQuery(
      `INSERT INTO equipments (category, school_code, serial_number, name, value, model, teacher_name, student_school_id, student_name, location, purchase_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, school_code || '', serial_number || '', name, value || '', model || '', teacher_name || '', student_school_id || '', student_name || '', location || '', purchase_date || '']
    );
    const newItem = await getQuery('SELECT * FROM equipments WHERE id = ?', [result.lastID]);
    res.status(201).json(newItem);
  } catch (err) {
    console.error('创建设备错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    const allowedFields = ['category', 'school_code', 'serial_number', 'name', 'value', 'model', 'teacher_name', 'student_school_id', 'student_name', 'location', 'purchase_date', 'remark'];
    const updates = [];
    const values = [];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }
    values.push(req.params.id);
    await runQuery(`UPDATE equipments SET ${updates.join(', ')} WHERE id = ?`, values);
    const updated = await getQuery('SELECT * FROM equipments WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error('更新设备错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    const equipmentId = toPositiveInt(req.params.id);
    if (!equipmentId) {
      return res.status(400).json({ error: '设备ID不合法' });
    }
    const result = await runQuery('DELETE FROM equipments WHERE id = ?', [equipmentId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: '设备不存在' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/batch-delete', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    const numIds = normalizeIdArray(req.body.ids);
    if (!numIds || numIds.length === 0) {
      return res.status(400).json({ error: '请选择要删除的设备' });
    }
    const placeholders = numIds.map(() => '?').join(',');
    const result = await runQuery(`DELETE FROM equipments WHERE id IN (${placeholders})`, numIds);
    res.json({ message: `成功删除 ${result.changes} 条设备记录` });
  } catch (err) {
    console.error('批量删除设备错误:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
