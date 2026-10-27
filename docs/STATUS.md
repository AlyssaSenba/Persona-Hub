# STATUS — 当前进度、下一步与交接备注

> 更新时间：2026-10-27（最新改动：用户资料字段 + 设置 BOM 容错）
> 分支：`main`（本地领先 `origin/main` 3 个提交，尚未 push）
> 当前可用形态：P0.5 Persona Lab 浏览器版（Node + Vite + React）

## 1. 已完成

### 1.1 产品与文档

- 已整理 PRD、架构、API、记忆、安全、内容政策、成本、决策、调研、人设模板等文档。
- 已确定 P0.5 范围：只调聊天语气/称呼/情绪/主动性，不做记忆、日程、专注、外语、咨询、游戏。
- 人设 v0.2：男性、21–27、情侣关系、成熟冷静高智、外冷内热；名字在应用内设置。
- 已写入情绪表达边界：可以因用户产生情绪，但不能“演”、不能假装人类、不能虚构做过的事。
- 已拉取 GitHub 上协作者的 3 个提交，并把本地 `.env` 相关提交 rebase 到远程最新之上。

### 1.2 P0.5 Persona Lab

- 本地 Node 服务 + 浏览器界面；服务只监听 `127.0.0.1:4173`。
- 聊天（SSE 流式）、设置、安全词、`Ctrl+Shift+D` 调试入口。
- 人设调试：自然语言指令 → patch 提案 → 预览 → 应用 / 回滚。
- Electron 已移除：不再有 Electron 运行时、主进程/preload、`electron-vite` 配置和依赖。
- 构建改为 Vite；启动脚本：
  - Windows：`start-persona-lab-web.cmd`
  - Linux/macOS：`start-persona-lab-web.sh`
- 已修复聊天变长后输入框被挤出视口的问题（聊天区滚动、输入框固定在底部）。
- API Key 支持 `.env`：
  - 根目录 `.env` 的 `DEEPSEEK_API_KEY` 由 Node **每次请求实时读取**，改完不需要重启；
  - `.env` 已 gitignore；`.env.example` 只含占位符；
  - 设置页临时填的 Key 只保存在 Node 内存，`.env` 优先；
  - UI 会显示“Key 来自 .env（每次请求实时读取）”。
- 用户资料（来自 `关于用户.txt`）：设置页新增“关于你（选填）”——国籍/所在地、性别（男/女/无性别/不填）、特殊注意事项；写入 `config/web-settings.json`，并拼进系统提示词。资料只用于称呼/语气/分寸，没填的不猜；对话里改的下一轮生效，但不自动写回设置。
- 设置文件读取容错：`config/web-settings.json` 带 UTF-8 BOM 时不再整份回落到默认值；旧文件缺新字段时自动补默认值。

### 1.3 本机 Tauri 2 工具链（只装工具，没有生成 Tauri 项目）

- Tauri CLI：`2.12.4`，用户级全局 PATH。
- Rust：`1.99.1`；Cargo：`1.99.1`；toolchain：`stable-x86_64-pc-windows-msvc`。
- MSVC：Visual Studio 生成工具 2022（用户目录安装）。
- Windows SDK：`10.0.26100.0`。
- WebView2：`155.0.4283.62`。
- PowerShell `CurrentUser` 执行策略已设为 `RemoteSigned`，否则 `tauri.ps1` 会被拦截。
- `tauri info` 当前环境项全绿；**没有创建 `src-tauri`，没有安装 `@tauri-apps/api`，没有执行 Tauri 构建**。

### 1.4 验证记录

- `npm run typecheck`：通过。
- `npm run build`：通过（Vite，输出 `out/renderer`）；加入用户资料字段后重跑仍通过。
- 临时实例验证（`PORT=4199` + 独立临时工作目录，不动正在用的 `config/`）：旧设置文件缺字段自动补默认值、带 BOM 的设置文件可正常读取、中文资料往返正常、`userNotes` 超长截断到 500 字。
- 本地服务：`GET /api/settings` 返回 `hasApiKey=true`、`keySource=env`。
- 真实 DeepSeek 请求：通过（通过 `.env` 读取 Key，未打印 Key）。
- `tauri info`：WebView2 / MSVC / rustc / cargo / rustup / Rust toolchain 全部通过。
- `git status`：本次整理前只有 `关于用户.txt` 未跟踪；已作为需求来源提交。

## 2. 接下来要做的任务

### 2.1 先用网页版调性格（当前优先级）

- 打开 `start-persona-lab-web.cmd`，访问 `http://127.0.0.1:4173`。
- 用真实模型多聊几轮，观察：语气是否自然、是否过度反问、是否“演”、情绪强度是否合适。
- 用调试面板把有效调整保存为 patch；确认哪些规则应写回 `persona.md` v0.3。
- 决定是否保留某些 patch 长期生效，避免规则越叠越僵。

### 2.2 用户资料调查（来自 `关于用户.txt`）

- P0.5 已完成最小可用版本：设置页“关于你”三分栏（国籍/性别/特殊注意事项）+ 系统提示词接入，见 1.2。
- 仍待 P1：首次引导里的资料调查（必填/选填分组、可跳过）、对话中改资料自动写回设置（需要工具调用/记忆）、字段清洗与迁移策略。
- `关于用户.txt` 继续作为需求来源保留，并入 P1 引导设计后可以移进 `docs/`。

### 2.3 最终桌面 app（等用户确认后再做）

- 用已装好的 Tauri 2 搭最小 `src-tauri` 骨架，先验证窗口能启动。
- 迁移方案二选一：
  - Rust 后端重写设置/人设/patch/DeepSeek 调用；
  - 或 Node 作为 sidecar，复用现有 `server/` 逻辑。
- 之后再接托盘、系统通知、开机自启、全局快捷键。
- 正式分发前处理代码签名；本地未签名构建仍可能触发 SmartScreen/Defender。

### 2.4 P1 完整 app

- 首次引导 + 用户资料调查。
- 记忆：Markdown 真相源 + SQLite 索引、写入/召回/删除、敏感内容隔离。
- 专注：正计时/倒计时/自定义番茄钟。
- 外语：多语言、目标、词表、英语聊天（不做 AI 语音）。
- 日程：文件导入、提醒、条件任务。
- 心理咨询：基于书籍、非诊断、危机分级。
- 技能学习、小游戏。
- 统一人格、关系、记忆跨房间共享；控制上下文预算。

## 3. 注意与备注

- **Key 安全**：真实 Key 只在 `.env`；不要提交、不要回显、不要截图、不要写进日志。若怀疑泄露，去 DeepSeek 平台撤销重发。应用层能保证不回显/不下发前端/不进 Git；聊天记录和系统日志不在应用控制内。
- **不要重新引入 Electron**：这台 Windows 11 26200 上本地未签名 dev Electron 连 `--version` 都返回 `STATUS_BREAKPOINT`；DSH 能跑是因为它是签名成品、自带运行时。最终桌面壳用 Tauri 或正式签名方案。
- **Tauri 只装了工具链**：`tauri info` 绿不等于已有 app；需要先建 `src-tauri` 并确认构建方案。不要在没有确认前跑 `tauri build` 生成一堆构建产物。
- **服务安全**：只监听 `127.0.0.1`，没有鉴权；不要暴露到局域网/公网。
- **Git**：远程 SSH 22 端口当前被网络阻断；HTTPS fetch 可用。本地 `main` 领先 `origin/main` 3 个提交，未 push；不要 force push。
- **PATH**：Tauri CLI 在 `C:\Users\6fish\AppData\Roaming\npm\nodejs`；Cargo 在 `%USERPROFILE%\.cargo\bin`。已运行中的 DSH 终端可能不会自动刷新，新开终端生效。
- **`.env` 优先级**：`.env` 高于设置页临时 Key；改 `.env` 后下一次请求生效，不用重启服务。
- **P0.5 边界**：没有记忆/日程/专注/外语/咨询/游戏；不要把这些模块的未实现能力写进聊天承诺。
- **工作区清洁**：`.env`、`config/`、`out/`、`node_modules/` 等已忽略；提交前检查 `git status`。
