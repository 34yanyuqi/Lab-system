#!/usr/bin/env node
/**
 * 一次性数据修复：清理 notifications.content 中残留的富文本 HTML。
 *
 * 背景：审核评语（check_remark）是富文本，之前被原样拼进了通知正文，
 * 而首页「最新通知」和通知中心都是按纯文本渲染 content 的，
 * 于是页面上会直接显示出 <p>、<img src="data:image/png;base64,..."> 这类标签
 * （含图片的评语单条通知体积可达 100KB 以上）。
 *
 * 新版代码（routes/submissions.js）已改用 summarizeHtml 生成纯文本摘要，
 * 本脚本用于把历史数据刷成同样格式。
 *
 * 用法（在 backend 目录下执行）：
 *   node scripts/clean-notification-content.js           # 预演，只打印将要修改的内容
 *   node scripts/clean-notification-content.js --apply    # 真正写库
 */

const path = require('path')
const sqlite3 = require('sqlite3')
const config = require('../config')
const { summarizeHtml } = require('../utils/sanitize')

// 与 routes/submissions.js 中通知正文的评语摘要保持一致
const SUMMARY_MAX_LENGTH = 100
// 只处理“看起来含 HTML 标签”的行，避免误伤正文里出现普通小于号的通知
const HTML_TAG_PATTERN = /<[a-zA-Z!/]/

const apply = process.argv.includes('--apply')
const dbPath = path.resolve(__dirname, '..', config.db.path)
const db = new sqlite3.Database(dbPath)

const allQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  })

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this.changes)
    })
  })

async function main() {
  const rows = await allQuery('SELECT id, user_id, type, title, content FROM notifications ORDER BY id')
  const targets = []

  for (const row of rows) {
    const original = row.content || ''
    if (!HTML_TAG_PATTERN.test(original)) continue
    const cleaned = summarizeHtml(original, SUMMARY_MAX_LENGTH)
    if (!cleaned || cleaned === original) continue
    targets.push({ id: row.id, type: row.type, original, cleaned })
  }

  console.log(`数据库: ${dbPath}`)
  console.log(`通知总数: ${rows.length}，需要清理: ${targets.length}\n`)

  for (const item of targets) {
    console.log(`#${item.id} [${item.type}] ${item.original.length} -> ${item.cleaned.length} 字符`)
    console.log(`  before: ${item.original.slice(0, 80).replace(/\s+/g, ' ')}`)
    console.log(`  after : ${item.cleaned}`)
  }

  if (targets.length === 0) {
    console.log('没有需要清理的数据。')
    return
  }

  if (!apply) {
    console.log('\n这是预演模式（未写库）。确认无误后加 --apply 参数执行。')
    return
  }

  let updated = 0
  await runQuery('BEGIN')
  try {
    for (const item of targets) {
      updated += await runQuery('UPDATE notifications SET content = ? WHERE id = ?', [item.cleaned, item.id])
    }
    await runQuery('COMMIT')
  } catch (err) {
    await runQuery('ROLLBACK')
    throw err
  }

  console.log(`\n已更新 ${updated} 条通知。`)
}

main()
  .catch((err) => {
    console.error('清理失败:', err.message)
    process.exitCode = 1
  })
  .finally(() => db.close())
