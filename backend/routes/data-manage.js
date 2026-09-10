const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const { runQuery, getQuery, allQuery } = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { requireEmailVerification } = require('../middleware/emailVerification');

const router = express.Router();
router.use(authMiddleware);
router.use(requireEmailVerification);

const uploadDir = path.join(__dirname, '..', 'uploads', 'temp');
fs.mkdirSync(uploadDir, { recursive: true });

const TEMP_FILE_TTL = 2 * 60 * 60 * 1000; // 临时文件保留 2 小时

/**
 * 解析前端传入的 fileId，并确保结果始终位于 uploads/temp 目录内。
 * 直接 path.join(uploadDir, fileId) 会允许 "../../" 形式的路径穿越。
 */
function resolveTempFile(fileId) {
  if (typeof fileId !== 'string' || !fileId) return null;
  const safeName = path.basename(fileId);
  if (!safeName || safeName === '.' || safeName === '..') return null;
  const resolved = path.resolve(uploadDir, safeName);
  if (!resolved.startsWith(path.resolve(uploadDir) + path.sep)) return null;
  return resolved;
}

/** 清理超过 TTL 的导入临时文件，避免磁盘无限增长 */
function cleanupTempFiles() {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(uploadDir)) {
      const filePath = path.join(uploadDir, name);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtimeMs > TEMP_FILE_TTL) {
          fs.unlinkSync(filePath);
        }
      } catch { /* 忽略单个文件清理失败 */ }
    }
  } catch { /* 目录不存在等情况忽略 */ }
}

cleanupTempFiles();
const cleanupTimer = setInterval(cleanupTempFiles, 30 * 60 * 1000);
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件格式（.xlsx, .xls）'), false);
    }
  }
});

const TABLE_CONFIG = {
  students: {
    tableName: 'users',
    label: '学生名单',
    whereClause: "role = 'student'",
    columns: [
      { name: 'id', type: 'INTEGER', length: '', nullable: false, pk: true, label: 'ID' },
      { name: 'username', type: 'TEXT', length: '', nullable: false, pk: false, label: '用户名', defaultValue: '' },
      { name: 'password', type: 'TEXT', length: '', nullable: false, pk: false, label: '密码', defaultValue: '123456' },
      { name: 'student_id', type: 'TEXT', length: '', nullable: true, pk: false, label: '学号' },
      { name: 'student_grade', type: 'TEXT', length: '', nullable: true, pk: false, label: '年级' },
      { name: 'student_major', type: 'TEXT', length: '', nullable: true, pk: false, label: '专业' },
      { name: 'student_email', type: 'TEXT', length: '', nullable: true, pk: false, label: '邮箱' },
      { name: 'graduate_year', type: 'TEXT', length: '', nullable: true, pk: false, label: '毕业年份' },
      { name: 'student_phone', type: 'TEXT', length: '', nullable: true, pk: false, label: '手机号' },
      { name: 'student_id_card', type: 'TEXT', length: '', nullable: true, pk: false, label: '身份证号' },
      { name: 'student_bank_card', type: 'TEXT', length: '', nullable: true, pk: false, label: '银行卡号' },
      { name: 'student_bank_name', type: 'TEXT', length: '', nullable: true, pk: false, label: '开户行' }
    ],
    exportColumns: ['id', 'username', 'student_id', 'student_grade', 'student_major', 'student_email', 'graduate_year', 'student_phone', 'student_id_card', 'student_bank_card', 'student_bank_name'],
    importKeyColumn: 'student_id',
    importKeyLabel: '学号',
    uniqueColumns: [{ column: 'student_id', label: '学号' }]
  },
  equipments: {
    tableName: 'equipments',
    label: '实验设备',
    whereClause: '1=1',
    columns: [
      { name: 'id', type: 'INTEGER', length: '', nullable: false, pk: true, label: 'ID' },
      { name: 'category', type: 'TEXT', length: '', nullable: false, pk: false, label: '类别' },
      { name: 'school_code', type: 'TEXT', length: '', nullable: true, pk: false, label: '校内编号' },
      { name: 'serial_number', type: 'TEXT', length: '', nullable: true, pk: false, label: '设备序列号' },
      { name: 'name', type: 'TEXT', length: '', nullable: false, pk: false, label: '设备名称' },
      { name: 'value', type: 'TEXT', length: '', nullable: true, pk: false, label: '价值' },
      { name: 'model', type: 'TEXT', length: '', nullable: true, pk: false, label: '型号' },
      { name: 'teacher_name', type: 'TEXT', length: '', nullable: true, pk: false, label: '领用导师姓名' },
      { name: 'student_school_id', type: 'TEXT', length: '', nullable: true, pk: false, label: '使用学生学号' },
      { name: 'student_name', type: 'TEXT', length: '', nullable: true, pk: false, label: '使用学生姓名' },
      { name: 'location', type: 'TEXT', length: '', nullable: true, pk: false, label: '存放地址' },
      { name: 'purchase_date', type: 'TEXT', length: '', nullable: true, pk: false, label: '购置日期' },
      { name: 'remark', type: 'TEXT', length: '', nullable: true, pk: false, label: '备注' }
    ],
    exportColumns: ['id', 'category', 'school_code', 'serial_number', 'name', 'value', 'model', 'teacher_name', 'student_school_id', 'student_name', 'location', 'purchase_date', 'remark'],
    importKeyColumn: 'school_code',
    importKeyLabel: '校内编号',
    uniqueColumns: [{ column: 'school_code', label: '校内编号' }, { column: 'serial_number', label: '设备序列号' }]
  }
};

router.get('/tables', (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '无权操作' });
  }
  const tables = Object.entries(TABLE_CONFIG).map(([key, config]) => ({
    key,
    label: config.label,
    columns: config.columns,
    uniqueColumns: config.uniqueColumns || []
  }));
  res.json(tables);
});

router.get('/export/:tableKey', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    const { tableKey } = req.params;
    const config = TABLE_CONFIG[tableKey];
    if (!config) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const rows = await allQuery(
      `SELECT ${config.exportColumns.join(', ')} FROM ${config.tableName} WHERE ${config.whereClause}`
    );

    const headerLabels = config.exportColumns.map(col => {
      const colDef = config.columns.find(c => c.name === col);
      return colDef ? colDef.label : col;
    });

    const data = rows.map(row =>
      config.exportColumns.reduce((obj, col, i) => {
        obj[headerLabels[i]] = row[col] != null ? String(row[col]) : '';
        return obj;
      }, {})
    );

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, config.label);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(config.label)}_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('导出错误:', err);
    res.status(500).json({ error: '导出失败: ' + err.message });
  }
});

router.post('/parse', upload.single('file'), (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const filePath = req.file.path;
    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];

    if (!sheetName) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Excel文件不包含任何工作表' });
    }

    const ws = wb.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (jsonData.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Excel文件不包含结构化数据，请检查文件内容' });
    }

    const headers = Object.keys(jsonData[0]);
    const preview = jsonData.slice(0, 5);

    const result = {
      fileId: path.basename(filePath),
      sheetName,
      headers,
      totalRows: jsonData.length,
      preview
    };

    res.json(result);
  } catch (err) {
    console.error('解析Excel错误:', err);
    res.status(500).json({ error: '解析Excel文件失败: ' + err.message });
  }
});

router.post('/preview-import', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const { tableKey, fileId, columnMapping, strategy, defaultValues } = req.body;
    const config = TABLE_CONFIG[tableKey];
    if (!config) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const filePath = resolveTempFile(fileId);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: '上传文件已过期，请重新上传' });
    }

    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (jsonData.length === 0) {
      return res.status(400).json({ error: 'Excel文件无数据' });
    }

    const keyCol = config.importKeyColumn;
    const mappedKeyLabel = columnMapping[keyCol];
    if (!mappedKeyLabel) {
      return res.status(400).json({ error: `必须映射主键列：${config.importKeyLabel}` });
    }

    const defaults = defaultValues || {};

    const resolveValue = (col, row) => {
      const excelCol = columnMapping[col];
      if (excelCol && row[excelCol] !== undefined && String(row[excelCol]) !== '') {
        return String(row[excelCol]);
      }
      if (defaults[col] !== undefined && defaults[col] !== '') {
        return String(defaults[col]);
      }
      const colDef = config.columns.find(c => c.name === col);
      if (colDef && colDef.defaultValue !== undefined) {
        return String(colDef.defaultValue);
      }
      return '';
    };

    const existingRows = await allQuery(
      `SELECT * FROM ${config.tableName} WHERE ${config.whereClause}`
    );

    const uniqueSets = {};
    for (const uc of config.uniqueColumns) {
      uniqueSets[uc.column] = new Map();
      for (const r of existingRows) {
        const val = String(r[uc.column] || '');
        if (val) uniqueSets[uc.column].set(val, r);
      }
    }

    const importRows = [];
    const conflicts = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      const mappedRow = {};
      for (const col of config.columns.filter(c => !c.pk)) {
        mappedRow[col.name] = resolveValue(col.name, row);
      }
      mappedRow._rowIndex = i + 2;
      mappedRow._keyValue = mappedRow[keyCol] || '';

      let matchedUnique = null;
      let matchedLabel = '';
      for (const uc of config.uniqueColumns) {
        const val = mappedRow[uc.column];
        if (val && uniqueSets[uc.column] && uniqueSets[uc.column].has(val)) {
          matchedUnique = { column: uc.column, value: val, existingRow: uniqueSets[uc.column].get(val) };
          matchedLabel = uc.label;
          break;
        }
      }

      if (matchedUnique) {
        if (strategy === 'update') {
          mappedRow._status = 'update';
          mappedRow._matchColumn = matchedUnique.column;
          mappedRow._matchId = matchedUnique.existingRow.id;
        } else if (strategy === 'delete_append') {
          mappedRow._status = 'replace';
          mappedRow._matchColumn = matchedUnique.column;
          mappedRow._matchId = matchedUnique.existingRow.id;
          conflicts.push({
            row: i + 2,
            key: matchedUnique.value,
            message: `${matchedLabel} ${matchedUnique.value} 已存在，删除追加策略将覆盖该记录`
          });
        } else {
          mappedRow._status = 'skip';
          conflicts.push({
            row: i + 2,
            key: matchedUnique.value,
            message: `${matchedLabel} ${matchedUnique.value} 已存在，该记录将被跳过`
          });
        }
      } else {
        mappedRow._status = 'new';
      }

      importRows.push(mappedRow);
    }

    const newCount = importRows.filter(r => r._status === 'new').length;
    const updateCount = importRows.filter(r => r._status === 'update' || r._status === 'replace').length;
    const skipCount = importRows.filter(r => r._status === 'skip').length;
    const conflictCount = conflicts.length;

    res.json({
      totalRows: jsonData.length,
      newCount,
      updateCount,
      skipCount,
      conflictCount,
      conflicts,
      previewRows: importRows.slice(0, 50),
      columns: config.columns
    });
  } catch (err) {
    console.error('预览导入错误:', err);
    res.status(500).json({ error: '预览导入失败: ' + err.message });
  }
});

router.post('/execute-import', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: '无权操作' });
    }

    const { tableKey, fileId, columnMapping, strategy, defaultValues } = req.body;
    const config = TABLE_CONFIG[tableKey];
    if (!config) {
      return res.status(400).json({ error: '无效的数据表' });
    }

    const filePath = resolveTempFile(fileId);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: '上传文件已过期，请重新上传' });
    }

    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (jsonData.length === 0) {
      return res.status(400).json({ error: 'Excel文件无数据' });
    }

    const keyCol = config.importKeyColumn;
    const mappedKeyLabel = columnMapping[keyCol];
    if (!mappedKeyLabel) {
      return res.status(400).json({ error: `必须映射主键列：${config.importKeyLabel}` });
    }

    const allImportCols = config.columns.filter(c => !c.pk).map(c => c.name);
    const defaults = defaultValues || {};
    const needRole = config.tableName === 'users';

    const resolveValue = (col, row) => {
      const excelCol = columnMapping[col];
      if (excelCol && row[excelCol] !== undefined && String(row[excelCol]) !== '') {
        return String(row[excelCol]);
      }
      if (defaults[col] !== undefined && defaults[col] !== '') {
        return String(defaults[col]);
      }
      const colDef = config.columns.find(c => c.name === col);
      if (colDef && colDef.defaultValue !== undefined) {
        return String(colDef.defaultValue);
      }
      return '';
    };

    const hashPasswordIfNeeded = async (col, value) => {
      if (col === 'password' && value) {
        return await bcrypt.hash(value, 10);
      }
      return value;
    };

    const existingRows = await allQuery(
      `SELECT * FROM ${config.tableName} WHERE ${config.whereClause}`
    );

    const uniqueSets = {};
    for (const uc of config.uniqueColumns) {
      uniqueSets[uc.column] = new Map();
      for (const r of existingRows) {
        const val = String(r[uc.column] || '');
        if (val) uniqueSets[uc.column].set(val, r);
      }
    }

    const findExisting = (mappedRow) => {
      for (const uc of config.uniqueColumns) {
        const val = mappedRow[uc.column];
        if (val && uniqueSets[uc.column] && uniqueSets[uc.column].has(val)) {
          return { column: uc.column, existingRow: uniqueSets[uc.column].get(val) };
        }
      }
      return null;
    };

    let insertedCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let skippedCount = 0;
    const failedRecords = [];

    // 整批导入放入事务，避免中途异常导致数据处于半更新状态
    await runQuery('BEGIN IMMEDIATE');

    for (let rowIdx = 0; rowIdx < jsonData.length; rowIdx++) {
      const row = jsonData[rowIdx];
      const mappedRow = {};
      for (const col of allImportCols) {
        mappedRow[col] = resolveValue(col, row);
      }

      const match = findExisting(mappedRow);

      if (match) {
        if (strategy === 'update') {
          try {
            const setClauses = [];
            const setValues = [];
            for (const col of allImportCols) {
              if (col === 'password') continue;
              if (mappedRow[col] !== '') {
                setClauses.push(`${col} = ?`);
                setValues.push(await hashPasswordIfNeeded(col, mappedRow[col]));
              }
            }
            if (setClauses.length > 0) {
              setValues.push(match.existingRow.id);
              await runQuery(
                `UPDATE ${config.tableName} SET ${setClauses.join(', ')} WHERE id = ?`,
                setValues
              );
              for (const uc of config.uniqueColumns) {
                const val = String(match.existingRow[uc.column] || '');
                if (val && uniqueSets[uc.column]) {
                  uniqueSets[uc.column].delete(val);
                }
              }
              const updatedRow = await getQuery(`SELECT * FROM ${config.tableName} WHERE id = ?`, [match.existingRow.id]);
              if (updatedRow) {
                for (const uc of config.uniqueColumns) {
                  const val = String(updatedRow[uc.column] || '');
                  if (val && uniqueSets[uc.column]) {
                    uniqueSets[uc.column].set(val, updatedRow);
                  }
                }
              }
              updatedCount++;
            }
          } catch (err) {
            failedRecords.push({ rowIndex: rowIdx + 2, data: row, reason: '更新失败：' + err.message });
          }
        } else if (strategy === 'delete_append') {
          try {
            // 删除学生时同步清理关联数据，避免产生孤儿记录
            if (config.tableName === 'users') {
              await runQuery('DELETE FROM ai_chat_history WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = ?)', [match.existingRow.id]);
              await runQuery('DELETE FROM submissions WHERE student_id = ?', [match.existingRow.id]);
              await runQuery('DELETE FROM notifications WHERE user_id = ?', [match.existingRow.id]);
              await runQuery('DELETE FROM attendance_permissions WHERE student_id = ?', [match.existingRow.id]);
              await runQuery('DELETE FROM email_codes WHERE user_id = ?', [match.existingRow.id]);
              await runQuery('DELETE FROM project_members WHERE student_id = ?', [match.existingRow.id]);
            }
            await runQuery(
              `DELETE FROM ${config.tableName} WHERE id = ?`,
              [match.existingRow.id]
            );
            for (const uc of config.uniqueColumns) {
              const val = String(match.existingRow[uc.column] || '');
              if (val && uniqueSets[uc.column]) {
                uniqueSets[uc.column].delete(val);
              }
            }
            deletedCount++;

            const cols = needRole ? ['role', ...allImportCols] : [...allImportCols];
            const vals = needRole ? ['student'] : [];
            for (const col of allImportCols) {
              vals.push(await hashPasswordIfNeeded(col, mappedRow[col]));
            }
            const ph = cols.map(() => '?').join(',');
            const insertResult = await runQuery(
              `INSERT INTO ${config.tableName} (${cols.join(', ')}) VALUES (${ph})`,
              vals
            );
            const newRow = await getQuery(`SELECT * FROM ${config.tableName} WHERE id = ?`, [insertResult.lastID]);
            if (newRow) {
              for (const uc of config.uniqueColumns) {
                const val = String(newRow[uc.column] || '');
                if (val && uniqueSets[uc.column]) {
                  uniqueSets[uc.column].set(val, newRow);
                }
              }
            }
            insertedCount++;
          } catch (err) {
            failedRecords.push({ rowIndex: rowIdx + 2, data: row, reason: '删除追加失败：' + err.message });
          }
        } else {
          skippedCount++;
          const ucLabel = config.uniqueColumns.find(uc => uc.column === match.column);
          failedRecords.push({
            rowIndex: rowIdx + 2,
            data: row,
            reason: `${ucLabel ? ucLabel.label : match.column} ${match.existingRow[match.column]} 已存在，跳过该记录`
          });
        }
      } else {
        try {
          const cols = needRole ? ['role', ...allImportCols] : [...allImportCols];
          const vals = needRole ? ['student'] : [];
          for (const col of allImportCols) {
            vals.push(await hashPasswordIfNeeded(col, mappedRow[col]));
          }
          const ph = cols.map(() => '?').join(',');
          const insertResult = await runQuery(
            `INSERT INTO ${config.tableName} (${cols.join(', ')}) VALUES (${ph})`,
            vals
          );
          const newRow = await getQuery(`SELECT * FROM ${config.tableName} WHERE id = ?`, [insertResult.lastID]);
          if (newRow) {
            for (const uc of config.uniqueColumns) {
              const val = String(newRow[uc.column] || '');
              if (val && uniqueSets[uc.column]) {
                uniqueSets[uc.column].set(val, newRow);
              }
            }
          }
          insertedCount++;
        } catch (err) {
          failedRecords.push({ rowIndex: rowIdx + 2, data: row, reason: '新增失败：' + err.message });
        }
      }
    }

    await runQuery('COMMIT');

    try { fs.unlinkSync(filePath); } catch (e) {}

    const safeFailedRecords = failedRecords.map(r => {
      const displayData = {};
      for (const col of allImportCols) {
        const val = r.data[columnMapping[col]];
        if (val !== undefined && val !== null) {
          displayData[col] = typeof val === 'object' ? JSON.stringify(val) : String(val);
        } else {
          displayData[col] = '';
        }
      }
      return { rowIndex: r.rowIndex, data: displayData, reason: String(r.reason) };
    });

    res.json({
      success: true,
      message: `导入完成：新增 ${insertedCount} 条，更新 ${updatedCount} 条${deletedCount > 0 ? `，删除 ${deletedCount} 条` : ''}${skippedCount > 0 ? `，跳过 ${skippedCount} 条` : ''}`,
      insertedCount,
      updatedCount,
      deletedCount,
      skippedCount,
      failedRecords: safeFailedRecords,
      totalRows: jsonData.length
    });
  } catch (err) {
    try { await runQuery('ROLLBACK'); } catch { /* 事务可能尚未开启 */ }
    console.error('执行导入错误:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '导入失败: ' + err.message });
    }
  }
});

module.exports = router;
