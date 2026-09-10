const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const bcrypt = require('bcryptjs')
const config = require('./config')

const dbPath = path.resolve(__dirname, config.db.path)
const db = new sqlite3.Database(dbPath);

async function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        await runQuery(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            teacher_name TEXT,
            teacher_email TEXT,
            teacher_phone TEXT,
            student_id TEXT,
            student_grade TEXT,
            student_major TEXT,
            student_email TEXT,
            graduate_year TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT,
            teacher_id INTEGER NOT NULL,
            student_ids TEXT,
            end_date DATETIME NOT NULL,
            check_frequency INTEGER DEFAULT 7,
            doc_url TEXT,
            status TEXT DEFAULT 'active',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES users(id)
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            submit_content TEXT,
            submit_file TEXT,
            submit_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            check_status TEXT DEFAULT 'pending',
            check_remark TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (student_id) REFERENCES users(id)
          )
        `);

        try {
          await runQuery('ALTER TABLE submissions ADD COLUMN week_number INTEGER DEFAULT 1');
        } catch (e) {}
        try {
          await runQuery('ALTER TABLE submissions ADD COLUMN check_time DATETIME');
        } catch (e) {}
        try {
          await runQuery("UPDATE submissions SET check_time = submit_time WHERE check_remark IS NOT NULL AND check_remark != '' AND check_time IS NULL");
        } catch (e) {}

        try { await runQuery('ALTER TABLE users ADD COLUMN lab_room TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN monitor1_sn TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN monitor2_sn TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN computer_info TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN student_phone TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN student_id_card TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN student_bank_card TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE users ADD COLUMN student_bank_name TEXT'); } catch (e) {}

        await runQuery(`
          CREATE TABLE IF NOT EXISTS equipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            school_code TEXT,
            serial_number TEXT,
            name TEXT NOT NULL,
            value TEXT,
            model TEXT,
            teacher_name TEXT,
            student_school_id TEXT,
            student_name TEXT,
            location TEXT,
            purchase_date TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            related_id INTEGER,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS email_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        try { await runQuery('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch (e) {}
        try {
          await runQuery('ALTER TABLE users ADD COLUMN pin TEXT');
          console.log('已添加 pin 列到 users 表');
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.error('添加 pin 列失败:', e.message);
          }
        }
        try {
          await runQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pin ON users(pin)');
        } catch (e) {
          console.error('创建 pin 唯一索引失败:', e.message);
        }

        await runQuery(`
          CREATE TABLE IF NOT EXISTS ai_chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL UNIQUE,
            teacher_id INTEGER NOT NULL,
            messages TEXT NOT NULL DEFAULT '[]',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id),
            FOREIGN KEY (teacher_id) REFERENCES users(id)
          )
        `);

        // 仅非生产环境插入演示数据，避免生产库出现弱口令默认账号
        if (config.nodeEnv !== 'production' && process.env.SEED_SAMPLE_DATA !== 'false') {
          await insertSampleData();
        }

        // 常用查询索引（避免全表扫描）
        await runQuery('CREATE INDEX IF NOT EXISTS idx_submissions_task ON submissions(task_id)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(work_date)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, type)');
        await runQuery('CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id)');
        // 清理已过期的邮箱验证码
        await runQuery("DELETE FROM email_codes WHERE expires_at < datetime('now')");

        try { await runQuery('ALTER TABLE equipments ADD COLUMN remark TEXT'); } catch (e) {}
        try { await runQuery('ALTER TABLE equipments ADD COLUMN image_url TEXT'); } catch (e) {}

        // AI 分析历史表
        await runQuery(`
          CREATE TABLE IF NOT EXISTS ai_analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            task_id INTEGER NOT NULL,
            submission_ids TEXT NOT NULL,
            result TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES users(id),
            FOREIGN KEY (student_id) REFERENCES users(id),
            FOREIGN KEY (task_id) REFERENCES tasks(id)
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS attendance_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            work_date TEXT NOT NULL,
            morning_on_time TEXT DEFAULT '',
            morning_off_time TEXT DEFAULT '',
            afternoon_on_time TEXT DEFAULT '',
            afternoon_off_time TEXT DEFAULT '',
            batch_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        try {
          await runQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_name_date ON attendance_records(name, work_date)');
        } catch (e) {}

        await runQuery(`
          CREATE TABLE IF NOT EXISTS attendance_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            granted_by INTEGER NOT NULL,
            can_upload INTEGER DEFAULT 1,
            can_edit INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id),
            FOREIGN KEY (granted_by) REFERENCES users(id)
          )
        `);

        // 项目管理相关表
        await runQuery(`
          CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            teacher_id INTEGER NOT NULL,
            client_name TEXT,
            funding TEXT,
            start_date TEXT,
            end_date TEXT,
            status TEXT DEFAULT 'active',
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (teacher_id) REFERENCES users(id)
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS project_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id),
            UNIQUE(project_id, student_id)
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS project_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            deadline TEXT,
            status TEXT DEFAULT 'pending',
            completed_at DATETIME,
            sort_order INTEGER DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        await runQuery(`
          CREATE TABLE IF NOT EXISTS project_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_size INTEGER,
            uploaded_by INTEGER NOT NULL,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
          )
        `);

        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function insertSampleData() {
  const hashedPassword = await bcrypt.hash('123456', 10);
  
  const existingUsers = await allQuery('SELECT id FROM users LIMIT 2');
  if (existingUsers.length === 0) {
    await runQuery(`
      INSERT INTO users (role, username, password, teacher_name, teacher_email, teacher_phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['teacher', 'teacher1', hashedPassword, '张教授', 'zhang@example.com', '13800138001']);

    await runQuery(`
      INSERT INTO users (role, username, password, student_id, student_grade, student_major, student_email, graduate_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['student', 'student1', hashedPassword, '2023001', '2023级', '计算机科学', 'student1@example.com', '2027']);

    await runQuery(`
      INSERT INTO users (role, username, password, student_id, student_grade, student_major, student_email, graduate_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['student', 'student2', hashedPassword, '2023002', '2023级', '计算机科学', 'student2@example.com', '2027']);

    const teacher = await getQuery('SELECT id FROM users WHERE role = ?', ['teacher']);
    if (teacher) {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30);

      await runQuery(`
        INSERT INTO tasks (title, type, content, teacher_id, student_ids, end_date, check_frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, ['毕业论文开题报告', 'thesis', '请完成毕业论文开题报告，包括研究背景、研究方法等内容', teacher.id, '[2,3]', endDate.toISOString().split('T')[0], 7]);
    }
  }
}

function close(callback) {
  try {
    db.close(callback);
  } catch (err) {
    if (callback) callback(err);
  }
}

module.exports = {
  initDatabase,
  runQuery,
  getQuery,
  allQuery,
  close,
  db
};
