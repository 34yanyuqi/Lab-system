# 代码审查与修复记录

审查范围：`backend`（Express + SQLite）与 `frontend`（React 18 + TS + Vite + antd）。
以下为本次发现的问题与已落地的修复，按类别分组。

## 一、安全类

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | 生产环境可用的默认 JWT 密钥（`default-secret-key`） | `backend/config/index.js` | 生产环境密钥缺失/过短/为默认值时拒绝启动；开发环境打印警告 |
| 2 | `dotenv` 依赖启动时工作目录，非 backend 目录启动会静默回退到默认配置 | `backend/config/index.js` | 显式指定 `backend/.env` 路径 |
| 3 | 认证令牌可从 URL query 传入（泄漏到日志/Referer/历史） | `backend/middleware/auth.js` | 仅接受 `Authorization: Bearer`；错误响应统一 `{success,error,message,code}` |
| 4 | 登录/注册/颜色码登录无频率限制，可暴力破解 | `backend/middleware/rateLimit.js`（新增） | 新增内存限流中间件并应用于登录、注册、验证码邮件、全站 API |
| 5 | 存储型 XSS：提交内容/评语/任务正文以 innerHTML 渲染且后端不过滤 | `backend/utils/sanitize.js`（新增）、`frontend/src/utils/sanitizeHtml.ts`（新增） | 后端写入前清洗；前端 DOMParser 白名单清洗后再交给 `dangerouslySetInnerHTML` |
| 6 | 邮箱验证码可重复使用（`INSERT OR REPLACE` 无唯一约束，旧码不失效） | `backend/utils/email.js` | 写入前作废旧验证码；校验取最新记录；验证码改用 `crypto.randomInt` |
| 7 | SMTP 全局关闭证书校验 | `backend/utils/email.js` | 默认开启校验，仅在 `SMTP_TLS_REJECT_UNAUTHORIZED=false` 时关闭 |
| 8 | 越权（IDOR）：任务详情、任务提交列表、提交审核、批量审核、AI 对话/历史 | `backend/routes/tasks.js`、`submissions.js`、`ai.js` | 全部增加归属校验（教师仅能访问自己名下任务，学生仅能访问分配给自己的任务） |
| 9 | 数据导入 `fileId` 路径穿越（`../../` 可读取任意文件） | `backend/routes/data-manage.js` | `path.basename` + 目录前缀校验 |
| 10 | 注册接口未校验角色与输入，可写入任意 role | `backend/routes/auth.js` | 角色白名单 + 用户名/密码/邮箱格式校验 |
| 11 | 生产环境会写入演示账号（弱口令 123456） | `backend/database.js` | 仅非生产环境且 `SEED_SAMPLE_DATA != false` 时写入 |
| 12 | 仓库缺少 `.gitignore`，`.env`（含 JWT 密钥、SMTP 口令、AI Key）与数据库/上传目录未忽略 | 仓库根目录 | 新增根目录与前后端 `.gitignore` |
| 13 | `.env` 中的密钥已明文存在，建议轮换 | `backend/.env` | 需人工轮换（代码层面已阻止生产环境使用弱密钥） |

## 二、功能性 Bug

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | PIN 设置接口校验写错（`if (!verifyResult)` 恒为假），任意邮箱验证码都能设置 PIN | `backend/routes/auth.js` | 改为 `if (!verifyResult.valid)` |
| 2 | API 未匹配路由被 SPA 兜底吞掉，返回 HTML 而非 JSON 404 | `backend/server.js` | 新增 `app.use('/api', notFoundHandler)`，兜底路由排除 `/api` 与 `/uploads` |
| 3 | 考勤导入统计把 `INSERT OR IGNORE` 忽略的行也计入成功数；去重查询用了新建的 batch_id（恒为空） | `backend/routes/attendance.js` | 按 `this.changes` 计数；按导入日期范围批量读取已有记录去重 |
| 4 | 学生导入的打卡时间若是 Excel 时间序列（如 0.375）会按字符串比较，迟到/早退判定全错 | `backend/routes/attendance.js` | 新增 `normalizePunchTime`，统一为 HH:MM |
| 5 | 有上传权限的学生可删除全组整月考勤 | `backend/routes/attendance.js` | 学生仅能删除自己的记录 |
| 6 | 删除学生只清理 submissions，遗留通知/考勤权限/AI 记录等孤儿数据，且无事务 | `backend/routes/users.js` | 事务级联删除全部关联表 |
| 7 | 导入采用"删除追加"策略删学生时同样产生孤儿数据 | `backend/routes/data-manage.js` | 同步清理关联表 |
| 8 | 批量导入无事务，中途失败会留下半更新数据 | `backend/routes/data-manage.js` | `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` |
| 9 | 导入临时文件永不清理 | `backend/routes/data-manage.js` | 启动清理 + 每 30 分钟清理超过 2 小时的文件 |
| 10 | 设备图片上传/删除接口缺失，前端功能 100% 404 | `backend/routes/equipments.js`、`backend/database.js` | 新增 `image_url` 列与 `POST /:id/upload-image`、`DELETE /:id/image` |
| 11 | 任务创建/更新缺少校验，缺 title/end_date 直接 500 | `backend/routes/tasks.js` | 校验标题/类型/日期/检查频率，内容清洗 |
| 12 | 任务更新后新增的学生收不到通知 | `backend/routes/tasks.js` | 仅对新增学生发送通知与邮件 |
| 13 | 重新提交后旧的审核评语与审核时间残留 | `backend/routes/submissions.js` | 重新提交时清空 `check_status/check_remark/check_time` |
| 14 | 批量审核未校验参数，`submission_ids` 非数组时抛 500 | `backend/routes/submissions.js` | 参数校验 + 状态白名单 + 归属过滤 |
| 15 | 任务列表 N+1 查询（每个任务 3 次查询） | `backend/routes/tasks.js` | 改为批量聚合查询 |
| 16 | 教师统计的学生维度数据未按教师过滤，跨教师泄露 | `backend/routes/users.js` | 限定为该教师名下任务 |
| 17 | AI 多周分析未限定 task_id，可混入其他任务的提交 | `backend/routes/ai.js` | 查询增加 `s.task_id = ?` |
| 18 | 前端 `dataManage.confirmImport` 调用不存在的 `/data-manage/import` | `frontend/src/api/dataManage.ts` | 改为 `/data-manage/execute-import` 并按后端结构重写返回类型 |
| 19 | 前端 API 封装路径/字段与后端不符（设备字段名、`/allocate`、`/submissions/:id`、`/tasks/weekly-report`、`unread-count` 字段等） | `frontend/src/api/*.ts` | 按后端契约重写；删除无后端对应的死方法 |
| 20 | `DataManagePage` 存在但未注册路由，功能不可达 | `frontend/src/router/index.tsx`、`components/layout/AppLayout.tsx` | 注册路由并加入菜单 |
| 21 | `theme.lightAlgorithm` 在 antd v5 不存在（实际取到 undefined） | `frontend/src/App.tsx` | 改为 `defaultAlgorithm` |
| 22 | `getRemainingDays` 用 `Math.ceil`，今天截止显示"剩余1天"且"今天截止"分支不可达 | `frontend/src/utils/format.ts` | 改为 `Math.floor` |
| 23 | 未登录时 NotificationProvider 仍轮询通知接口，触发 401 跳转 | `frontend/src/contexts/NotificationContext.tsx` | 未登录直接跳过请求 |
| 24 | 401 拦截器会把注册/激活页强制跳转到登录页 | `frontend/src/api/axios.ts` | 公共页面不跳转 |
| 25 | 类型错误导致 `tsc --noEmit` 失败（ActivatePage、EquipmentsPage 等） | 多处 | 全部修复，`tsc --noEmit` 与 `vite build` 通过 |

## 三、工程规范

- 新增 `.gitignore`（根目录 + backend + frontend），移除误提交的空文件 `backend/.schema user`。
- `frontend/package.json` 补充 `typecheck`/`lint` 脚本与 ESLint 相关 devDependencies（原先只有 `.eslintrc.json` 却没有 eslint 依赖）。
- `vite.config.ts` 增加 `manualChunks`，把 3.4MB 单包拆分为 react/antd/echarts/文档解析四个 vendor 包。
- `server.js` 增加安全响应头、优雅关闭、`unhandledRejection` 记录、上传目录 `dotfiles: deny`。
- `errorHandler` 统一处理 multer 上传错误与 JSON 解析错误（返回 400/413 而非 500），并接入 logger。
- 数据库新增常用索引（submissions.task_id/student_id、notifications(user_id,is_read)、attendance_records.work_date、tasks.teacher_id 等）。
- 清理调试日志：`users.js`（打印含身份证/银行卡的请求体）、`equipments.js`、`data-manage.js`、`ai.js`。

## 四、遗留建议（未改动代码）

1. `/uploads` 为公开静态目录，随机文件名可降低风险，但严格来说应改为带鉴权的下载接口或签名 URL。
2. JWT 存于 localStorage，存在 XSS 场景下的令牌窃取风险，建议评估 httpOnly Cookie + CSRF 方案。
3. `GET /api/users/students` 返回身份证号/银行卡号等敏感字段，建议按需返回并记录访问审计。
4. 缺少自动化测试与 CI；建议补充关键路由的集成测试。
5. 生产部署需配置 `CORS_ORIGIN`（生产环境已禁止通配符）。
## 五、第二轮修复（基于子代理交叉审计的补充）

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | 编辑任务时把后端存储的原始 JSON 写入"外部链接"字段，提交后附件被删除并写入垃圾链接 | `frontend/src/pages/teacher/TasksPage.tsx`、`frontend/src/utils/file.tsx` | 链接字段仅回填链接类型；`getTaskDocumentMeta` 先按 `doc_kind` 判定类型 |
| 2 | 获得考勤权限的学生点击学生考勤详情必定 403，且错误被吞掉导致空白页 | `backend/routes/attendance.js` | 教师或拥有考勤上传/编辑权限的学生可查看他人考勤（已实测 200/403 均正确） |
| 3 | 评语时间线弹窗只按学生过滤，混入该学生所有任务的评语 | `frontend/src/pages/teacher/CheckPage.tsx` | 增加 taskId 维度过滤 |
| 4 | `isTaskActive` 在 useCallback 外捕获 `now`，任务截止后状态不更新 | `frontend/src/pages/teacher/CheckPage.tsx` | 在回调内取当前时间 |
| 5 | 提交列表"查看"写入 `viewSubmission`，但检查页读取 `openSubmissionId`，跳转后不会打开详情 | `frontend/src/pages/teacher/TasksPage.tsx` | 统一使用 `openSubmissionId` |
| 6 | AI 流式请求未捕获 fetch 异常，网络失败时永久卡在加载态；面板关闭后不中断流 | `frontend/src/api/ai.ts`、`components/ai/AiChatPanel.tsx` | 捕获异常回调 onError；新增 AbortSignal 并在卸载/新请求时中断 |
| 7 | 激活页"重新发送"调用需登录的 `/email/send-activation`，未登录必然 401 | `frontend/src/pages/ActivatePage.tsx`、`backend/routes/email.js` | 新增公开且限流的 `POST /email/resend-activation`（不泄露邮箱是否存在） |
| 8 | 学生首页把 `check_frequency`（检查间隔天数）当作周次总数，进度严重偏低 | `frontend/src/pages/student/HomePage.tsx` | 改用 `calcPeriods` 计算已开始周期数 |
| 9 | 统计页周次下拉固定 20 周，长期任务无法选择；接口失败无提示 | `frontend/src/pages/teacher/StatisticsPage.tsx` | 按任务实际周期动态生成选项；补充错误提示 |
| 10 | 考勤相关页面并发请求竞态：切换月份时旧响应覆盖新数据 | 新增 `frontend/src/hooks/useRequestGuard.ts`，应用于 4 个考勤页面 | 只允许最新请求写入状态，卸载后结果失效 |
| 11 | 学生考勤管理页在获取权限失败时永久停留在"正在加载..." | `frontend/src/pages/student/AttendanceManagePage.tsx` | 增加失败状态与重试按钮 |
| 12 | 任务保存/删除、学生保存、教师首页加载失败时无提示或产生未处理的 Promise 拒绝 | `TasksPage`、`StudentsPage`、`teacher/DashboardPage` | 统一 try/catch + message 提示 |

## 六、验证情况

- `frontend: npx tsc --noEmit` → 通过（修复前有 4 处类型错误）。
- `frontend: npm run build` → 通过，产物按 vendor 分包。
- `backend`：全部 `.js` 通过 `node --check`。
- 启动服务实测：`/health` 200、未知 API 返回 JSON 404、无令牌 401、SPA 兜底正常；
  教师/学生令牌实测任务越权 403、路径穿越 400、批量审核参数校验 400、AI 对话越权 403、
  设备图片删除 200、考勤权限查看 200/403 均符合预期。
## 七、第三轮修复（前端审计报告完整版的 LOW/MEDIUM 项）

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | 状态更新函数内调用 setState（StrictMode 下会重复执行副作用） | `frontend/src/pages/LoginPage.tsx` | 退格逻辑改为在外部用 `quickInput` 计算后再更新 |
| 2 | 账号登录后用未保护的 `JSON.parse(localStorage.user)`，数据损坏会导致登录后跳转崩溃 | `frontend/src/pages/LoginPage.tsx` | 加 try/catch，与颜色码登录路径保持一致 |
| 3 | ProfilePage 两个挂载 effect 重复调用 `fetchProfile()`，且第一个用了空依赖却引用 `isTeacher` | `frontend/src/pages/ProfilePage.tsx` | 合并为单个 effect，一次请求完成表单回填与邮箱状态同步，并加取消标记 |
| 4 | `myEquipments` 为 `any[]`、`hasPin` 通过 `(profile as any)` 读取 | `frontend/src/pages/ProfilePage.tsx`、`types/index.ts` | 类型化为 `EquipmentItem[]`；`User` 增加 `hasPin?: boolean` |
| 5 | 验证码刷新控件是无可访问名称的 span/button | `LoginPage.tsx`、`RegisterPage.tsx` | 改为真实 `button` 并补 `title`/`aria-label` |
| 6 | 使用已废弃的 Modal `visible` 属性 | `frontend/src/pages/teacher/BatchReviewPage.tsx` | 改为 `open` |
| 7 | 任务页学生列表加载、设备页保存/删除缺少 catch，失败即未处理的 Promise 拒绝且无提示 | `teacher/TasksPage.tsx`、`teacher/EquipmentsPage.tsx` | 统一 try/catch + message 提示 |
| 8 | AppLayout 的 `permissionLoaded` 是死状态，权限获取失败无任何降级说明 | `components/layout/AppLayout.tsx` | 删除死状态，改为可取消的请求并按"无权限"静默降级 |

未改动（建议后续重构，非功能缺陷）：
- `DataManagePage.tsx` 与 `components/common/DataImportModal.tsx` 两套高度相似的 Excel 导入向导已出现漂移，建议抽成共享组件/ hook。
- 学生考勤页月份切换的请求频率可进一步加防抖（当前已用请求竞态守卫保证数据正确性）。

第三轮验证：`npx tsc --noEmit` 通过，`npm run build` 通过。

## 八、第四轮修复（首页「最新通知」显示 HTML 标签）

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | 审核评语是富文本（可能含 `<p>`、`<img src="data:image/png;base64,...">`），被原样拼进通知正文；而首页「最新通知」与通知中心按纯文本渲染 `content`，页面上直接暴露出 HTML 标签，含图片的评语单条通知体积可达 120KB+ | `backend/routes/submissions.js`（审核、批量审核两处） | 新增 `summarizeHtml`（`backend/utils/sanitize.js`），通知正文改用纯文本摘要（去标签、折叠空白、截断 100 字）；评语原件写入 `check_remark` 与邮件不受影响 |
| 2 | 历史通知已含 HTML，仅改代码无法修复存量数据 | `backend/scripts/clean-notification-content.js`（新增） | 一次性清理脚本，默认预演，`--apply` 才写库并在事务中执行 |

第四轮验证：7 条存量通知已清理（最大 121579 → 45 字符），库中已无含标签的通知；`node --check` 通过，`routes/submissions.js` 可正常加载。
