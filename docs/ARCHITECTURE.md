# ARCHITECTURE — AI伙伴

> 本文分两部分：**第一部分是当前已实现的 P0.5 人设调试器（以源码为准）**；**第二部分是 P1 及以后的规划设计（尚未实现）**。桌面壳（Tauri / 正式签名 Electron / 其他）尚未决定，见 [DECISIONS](DECISIONS.md) D047。

# 第一部分：当前实现（P0.5 人设调试器）

## A1. 总览

```text
┌──────────────────────────────────────────────┐
│ 浏览器（任意现代浏览器：Edge / Chrome / Firefox）│
│  React 19 + TypeScript，src/renderer          │
│  window.lab = createWebLab()（fetch + SSE）   │
└───────────────▲──────────────────────────────┘
                │ HTTP（仅 127.0.0.1:4173）
┌───────────────┴──────────────────────────────┐
│ Node 服务 server/index.mts（无框架，node:http） │
│  /api/*  设置 · 聊天(SSE) · 调试 patch         │
│  静态托管 out/renderer                         │
│  server/persona.ts  提示词组装                 │
│  DeepSeek 调用（fetch，流式 / 非流式）          │
└───────────────┬──────────────────────────────┘
                │
        persona.md（只读） · config/（运行时，已忽略）
```

**一句话**：浏览器只做 UI；模型调用、文件读写、API Key 都在本地 Node 服务里；服务只监听回环地址。

## A2. 技术栈与平台

| 层 | 选型 |
|---|---|
| 前端 | React 19 + TypeScript，手写 CSS（`src/renderer/src/styles.css`） |
| 构建 | Vite 8（`vite.config.mts`，输出 `out/renderer`） |
| 服务 | Node ≥ 22，`node --experimental-strip-types` 直接运行 `.mts`，无打包、无 Web 框架 |
| 模型 | DeepSeek `deepseek-flash`，非思考模式，OpenAI 兼容 `chat/completions` |
| 校验 | 暂无（P1 引入 Zod） |
| 类型检查 | `tsc --noEmit`（`npm run typecheck`） |

平台：**Windows 与 Linux 均可运行**（macOS 理论可用，未验证）。只用 Node 内置模块；无原生依赖，不需要编译工具链。

| 脚本 | 作用 |
|---|---|
| `npm run build` | `vite build`，生成 `out/renderer` |
| `npm start` | 启动 Node 服务并自动打开浏览器 |
| `npm run typecheck` | TypeScript 类型检查 |
| `start-persona-lab-web.cmd` | Windows 一键：装依赖 → 构建 → 启动 |
| `start-persona-lab-web.sh` | Linux/macOS 一键：同上 |

环境变量：`PORT`（默认 `4173`）、`NO_OPEN=1`（不自动打开浏览器；自动打开在 Windows 用 `cmd /c start`、macOS 用 `open`、Linux 用 `xdg-open`，失败只打印网址）。

## A3. 目录结构

```text
persona.md                 人设（只读，提示词核心）
server/
  index.mts                HTTP 服务、路由、DeepSeek 调用、patch 存取
  persona.ts               系统提示词 / patch 提案提示词 / 预览提示词
src/
  shared/types.ts          前后端共享类型（LabApi、设置、patch、事件）
  renderer/
    index.html
    src/
      main.tsx             入口，挂载 window.lab
      webLab.ts            LabApi 的 HTTP 实现（含 SSE 解析）
      App.tsx              聊天界面、安全词/快捷键、调试入口
      components/          SettingsModal、DebugModal
      styles.css
vite.config.mts            前端构建
config/                    运行时（git 忽略）：web-settings.json、persona-patches/*.json
out/                       构建产物（git 忽略）
```

## A4. 运行时数据与密钥

- 设置：`config/web-settings.json`（称呼、关系、安全词、演示模式、已启用 patch id、**用户资料**：`userGender` / `nationality` / `userNotes`、**家人称呼**：`familyRole` / `familyAddress`）。**不含 API Key。**
- 家人称呼：只在 `relationship === 'family'` 时进提示词；选项按用户性别筛选（女/男各一组，`none` 与 `unspecified` 给全部），与性别不匹配的值回落为 `unspecified`；`familyAddress` 截断 12 字。
- 用户资料：`userGender` 为 `unspecified | male | female | none`（`none` = 无性别），`nationality` 截断 40 字，`userNotes` 截断 500 字；旧设置文件缺字段时由 `loadSettings` 补默认值，读 JSON 时会去掉 BOM（否则整份设置会静默回落到默认值）。
- patch：`config/persona-patches/<uuid>.json`，一个 patch 一个文件；停用 = 从 `activePatchIds` 移除，文件保留；重新启用 = 把 id 加回（`POST /api/debug/activate`）。
- **API Key 不进 `config/`**：优先从根目录 `.env` 每次请求实时读取；设置页临时填的只保存在 Node 进程内存、不落盘、不写日志。渲染层只得到 `hasApiKey` 与 `keySource`。
- 路径基准是启动时的工作目录（`process.cwd()`），请在项目根目录运行。

## A5. 聊天流程

1. UI 调用 `window.lab.sendChat`，`POST /api/chat`，响应为 SSE。
2. 服务端用 `persona.md` + 设置（含用户资料）+ 已启用 patch 组装系统提示词（`buildSystemPrompt`），拼上最近 20 条历史（过滤 `[错误]` 开头的消息）。资料段只列已填项，并附“不是记忆、没填不要猜、对话中改了就以最新说法为准”的规则。
3. 演示模式或未配置 Key：本地 `demoReply` 逐字符块推送；否则 `streamDeepSeek` 转发 DeepSeek 流。
4. 事件 `chunk` / `done` / `error` 逐条推给 UI；`POST /api/cancel` 通过 `AbortController` 中止；客户端断开也会中止。
5. 对话中修改资料只影响本会话（提示词每轮重建）；持久化要回设置页保存——P0.5 没有工具调用，模型无法写设置。
6. 每轮聊天会随机注入一条【本轮倾向】（挑话题方向：想法/日常/小事/假设），避免模型总用同一种开场；预览接口不注入，保证前后对比一致。
7. 提示词只用 `persona.md` 的正文；`## 18. 版本` 段（变更记录）不注入，避免模型复述内部机制。

## A6. 人设调试（patch）流程

- 入口：设置里的“调试人设”、快捷键 `Ctrl+Shift+D`、聊天里输入安全词（在 UI 本地拦截，不发给模型）。
- 提案：`POST /api/debug/propose`，模型在 JSON 模式下输出 `{title, summary, rules[≤6], examples[≤4]}`，服务端清洗并校验，没有规则则报错。
- 预览：`POST /api/debug/preview`，对至多 4 条样例分别用“当前”和“当前 + 新 patch”各生成一次，返回前后对比；不写盘。
- 应用：`POST /api/debug/apply` 写 patch 文件并加入 `activePatchIds`，下一轮聊天生效。
- 回滚：`POST /api/debug/revert` 从 `activePatchIds` 移除，文件保留。
- 重新启用：`POST /api/debug/activate` 把 id 加回；设置页列出已停用的 patch，可一键恢复，避免“回滚即永久丢失”。
- 提案提示词（`server/persona.ts`）要求 patch 只调语气、称呼、情绪、主动性等，不得改安全 / 内容 / 危机 / 能力边界；这是提示词层面的约束，服务端没有字段白名单校验。

## A7. 安全现状

- 只监听 `127.0.0.1`；未做鉴权，**不要用反向代理 / 端口转发暴露到局域网或公网**。
- 静态文件托管有路径穿越校验；请求体上限 5 MB。
- API Key 不落盘（`.env` 除外，已 gitignore）；`config/` 在 `.gitignore` 中。
- 前端 CSP 在 `src/renderer/index.html`，仅允许同源和 `localhost` 连接。
- 完整的安全设计（路径守卫、prompt injection、工具确认）属规划，见 [SECURITY](SECURITY.md)。

## A8. 验证方式

当前没有自动化测试。改动后至少执行：`npm run typecheck`、`npm run build`，再 `npm start` 在演示模式下走一遍聊天、设置（含用户资料）和调试 patch 流程。改动服务端逻辑时，可用临时工作目录 + `PORT=4199 NO_OPEN=1 npm start` 起第二个实例做往返验证，不要动正在用的 `config/`。

---

# 第二部分：规划设计（P1 及以后，尚未实现）

> 以下为完整 app 的目标设计。技术选型除 React + TypeScript、Markdown + SQLite、DeepSeek 外**均未锁定**；桌面壳、SQLite 驱动（原生 / WASM / `node:sqlite`）、UI 库、校验库等在搭 P1 骨架时先做最小验证再定。目录与模块名只是目标结构。

## 5. 数据层

### 5.1 双存储原则

- **Markdown**：长期记忆的真相源（人可读、可改、可迁移）。
- **SQLite**：结构化数据（任务、计时、单词卡、行动账本、用量）与检索索引。
- **不把 Markdown 内容只存 SQLite**；否则用户无法直接查看/编辑，违背产品原则。

### 5.2 SQLite 表（核心）

```sql
-- 设置/人格
settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
personas(id TEXT PRIMARY KEY, ai_name TEXT NOT NULL, ai_nickname TEXT,
         user_name TEXT, user_nickname TEXT, address_preference TEXT,
         relationship TEXT DEFAULT 'couple', age_range TEXT,
         profile_json TEXT, created_at TEXT, updated_at TEXT);
persona_patches(id TEXT PRIMARY KEY, base_version TEXT, instruction TEXT,
                diff_json TEXT NOT NULL, examples_json TEXT, status TEXT,
                created_at TEXT, applied_at TEXT, reverted_at TEXT);

-- 对话
conversations(id TEXT PRIMARY KEY, room TEXT NOT NULL, title TEXT,
              created_at TEXT, updated_at TEXT);
messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
         content TEXT NOT NULL, reasoning TEXT, tool_calls_json TEXT,
         tokens_in INTEGER, tokens_out INTEGER, model TEXT, created_at TEXT);

-- 记忆索引（Markdown 为真相源）
memories(id TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL,
         text TEXT NOT NULL, tags TEXT, sensitivity TEXT DEFAULT 'normal',
         confidence REAL DEFAULT 0.8, source TEXT, source_ref TEXT,
         file_path TEXT, file_hash TEXT, pinned INTEGER DEFAULT 0,
         created_at TEXT, updated_at TEXT, last_used_at TEXT, archived INTEGER DEFAULT 0);

-- 事件/今日简报
events(id TEXT PRIMARY KEY, kind TEXT NOT NULL, room TEXT, payload_json TEXT,
       importance INTEGER DEFAULT 1, occurred_at TEXT, created_at TEXT);
daily_briefs(date TEXT PRIMARY KEY, summary TEXT, payload_json TEXT, created_at TEXT);

-- 日程
tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, due_at TEXT,
      duration_min INTEGER, priority INTEGER, tags TEXT, status TEXT,
      recurrence_json TEXT, condition_json TEXT, source TEXT,
      created_at TEXT, updated_at TEXT, completed_at TEXT);
reminders(id TEXT PRIMARY KEY, task_id TEXT, fire_at TEXT, status TEXT,
          snooze_until TEXT, created_at TEXT);
task_events(id TEXT PRIMARY KEY, task_id TEXT, kind TEXT, payload_json TEXT, created_at TEXT);

-- 专注
focus_sessions(id TEXT PRIMARY KEY, kind TEXT, planned_sec INTEGER, elapsed_sec INTEGER,
               started_at TEXT, ended_at TEXT, status TEXT, task_id TEXT,
               interruptions INTEGER DEFAULT 0, note TEXT);

-- 外语
language_goals(id TEXT PRIMARY KEY, language TEXT, goals_json TEXT, level TEXT,
               daily_new INTEGER, daily_review INTEGER, created_at TEXT, updated_at TEXT);
word_packs(id TEXT PRIMARY KEY, name TEXT, language TEXT, source TEXT, license TEXT,
           entry_count INTEGER, builtin INTEGER DEFAULT 0);
words(id TEXT PRIMARY KEY, language TEXT, lemma TEXT, phonetic TEXT, pos TEXT,
      meaning_zh TEXT, example TEXT, example_zh TEXT, tags TEXT,
      pack_id TEXT, created_at TEXT);
cards(id TEXT PRIMARY KEY, word_id TEXT NOT NULL, due_at TEXT, stability REAL,
      difficulty REAL, reps INTEGER, lapses INTEGER, state TEXT,
      last_review_at TEXT, created_at TEXT);
reviews(id TEXT PRIMARY KEY, card_id TEXT, rating INTEGER, reviewed_at TEXT,
        elapsed_ms INTEGER, scheduled_days REAL);

-- 心理
counseling_sessions(id TEXT PRIMARY KEY, started_at TEXT, ended_at TEXT,
                    mode TEXT, summary TEXT, private INTEGER DEFAULT 1);
mood_logs(id TEXT PRIMARY KEY, score INTEGER, tags TEXT, note TEXT, created_at TEXT);
safety_plans(id TEXT PRIMARY KEY, content_json TEXT, updated_at TEXT);

-- 技能
skill_plans(id TEXT PRIMARY KEY, topic TEXT, goal TEXT, level TEXT,
            plan_json TEXT, created_at TEXT, updated_at TEXT);
practice_logs(id TEXT PRIMARY KEY, plan_id TEXT, kind TEXT, minutes INTEGER,
              note TEXT, created_at TEXT);

-- 游戏
game_sessions(id TEXT PRIMARY KEY, game TEXT, state_json TEXT,
              created_at TEXT, updated_at TEXT, finished INTEGER DEFAULT 0);

-- 行动账本/用量/迁移
action_log(id TEXT PRIMARY KEY, tool TEXT, args_json TEXT, result_json TEXT,
           risk TEXT, confirmed INTEGER, ok INTEGER, error TEXT, created_at TEXT);
usage_log(id TEXT PRIMARY KEY, kind TEXT, model TEXT, tokens_in INTEGER,
          tokens_out INTEGER, cost_usd REAL, room TEXT, created_at TEXT);
schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT);
```

### 5.3 Markdown 结构

```text
memory/
  core/
    relationship.md      # 关系、称呼、边界、纪念日、承诺
    persona-notes.md     # 用户对人设的补充（可选）
  profile.md             # 用户事实
  preferences.md         # 喜好/雷区/习惯
  people.md              # 用户身边的人
  events/
    2026-10.md           # 按月事件/情节摘要
  skills.md              # 学习进度摘要
  counseling/
    2026-10.md           # 咨询摘要（可加锁）
  inbox/                 # 待审阅的新记忆（可选）
```

每条记忆在 Markdown 中用固定格式，便于解析：

```markdown
- [2026-10-26] [core] 用户希望被称呼为“小六”。来源：首次设定。置信度：高。
- [2026-10-26] [preference] 用户喜欢晚上写代码，上午容易分心。来源：对话。置信度：中。
```

### 5.4 索引同步

- 写记忆：先写/更新 Markdown → 计算文件 hash → 更新 SQLite 索引。
- 启动/文件监听：扫描 `memory/**/*.md`，对比 `file_hash`；变化则重建该文件索引。
- 冲突：以 Markdown 为准；SQLite 只读重建。
- 删除：删除 Markdown 条目 → 删除索引 → 记录 `action_log`（不含内容或按用户选择）。
- 大文件：按条目拆分，单条不超过 2k 字符；摘要保留。

---

## 6. 记忆架构

### 6.1 分层

| 层 | 内容 | 衰减 | 用户可改 | 备注 |
|---|---|---|---|---|
| core | 关系、称呼、边界、纪念日、承诺 | 否 | 是 | AI 默认不删；用户可删 |
| episodic | 按月/事件的故事摘要 | 可压缩 | 是 | 原文归档可回溯 |
| semantic | 事实、偏好、习惯、雷区 | 可降权 | 是 | 新信息覆盖旧信息 |
| sensitive | 心理/健康/家庭/亲密 | 不主动提 | 是 | 可加锁；默认不进普通检索 |

### 6.2 写入管线

```text
对话/事件
  → 候选提取（LLM，结构化 JSON）
  → 分类（core/episodic/semantic/sensitive）
  → 去重/合并（相似度 + 实体 + 时间）
  → 敏感检测（关键词 + LLM）
  → 置信度/来源
  → 写入 Markdown + 索引
  → 进入记忆收件箱（默认未确认）
```

- 触发：每 5–10 轮批处理一次；会话结束；重要事件（任务完成/咨询结束）。
- 输出 schema：`{layer, kind, text, tags, sensitivity, confidence, source}`。
- 失败：不阻塞聊天；进入重试队列；UI 提示“有记忆待整理”。
- 用户说“记住 X”：立即写入，进收件箱。
- 用户说“忘掉 X”：确认范围 → 删除；不偷偷保留。

### 6.3 检索

- 查询构造：当前房间 + 用户消息 + 今日简报 + 最近话题。
- 召回信号：FTS5 关键词、标签、实体、时间衰减、重要性、置顶。
- 排序：`score = 关键词相关 + 0.3*重要性 + 0.2*新近度 - 敏感惩罚`。
- 取 top-k（默认 6–10 条），每条截断；总预算 1–3k tokens。
- 敏感记忆：默认不检索；咨询房间内且已解锁才检索。
- 引用：回复中可带“你上次说……”，不伪造来源。

### 6.4 矛盾/更新

- 新事实与旧事实冲突：保留新事实，旧事实标 `superseded_by`，降权/归档。
- 用户纠正：立即覆盖，记录来源。
- AI 推断 vs 用户明说：用户明说优先；推断降为“待确认”。

### 6.5 压缩/整理

- 每周：把本周事件压成摘要；合并重复偏好；清理低价值碎片。
- 每月：把月摘要折叠成季度/年度摘要（可选）。
- 压缩前后备份；可回滚。

### 6.6 “不会忘记”的语义

- 核心记忆不因时间/压缩自动消失。
- 用户删除是唯一例外；删除需确认。
- 模型换版本/换提示不丢记忆；记忆在文件里。
- 不保证“每句话都记得”；只保证“重要的事不被静默丢弃”。

---

## 7. Agent 编排

### 7.1 回合流程

```text
用户输入
  → 载入房间配置/人格/用户模型/今日简报
  → 检索记忆
  → 组装 prompt（预算内）
  → 调用 DeepSeek（流式）
  → 文本？→ 显示 → 结束
  → 工具调用？→ 校验 → 确认（如需要）→ 执行 → 写账本 → 结果回传 → 继续
  → 达到最大步数/超时 → 停止并解释
```

### 7.2 Prompt 组装顺序（稳定前缀优先，便于缓存）

1. **系统宪法**：身份、诚实、能力边界、安全、内容政策（稳定）。
2. **人格**：`persona.md` + 生效的 persona patch（core_persona；含名字/昵称、称呼偏好、关系、情绪/反表演规则；不可被房间/游戏覆盖）。
3. **关系**：`relationship.md`（较稳定）。
4. **用户模型摘要**：1–2k（半稳定）。
5. **房间规则**：当前房间的目标/语气/工具（稳定）。
6. **今日简报/事件**：动态。
7. **检索记忆**：动态。
8. **最近对话**：动态。
9. **工具清单**：稳定（按房间）。
10. **时间/地区/系统状态**：动态。

> 稳定内容放前面，DeepSeek 的自动缓存更容易命中。
> 人设分两层：`core_persona`（不可被房间/游戏覆盖）+ `role_layer`（游戏/NPC/语言练习，可切换）。

### 7.3 Token 预算（每轮目标 8–12k）

| 部分 | 预算 |
|---|---:|
| 系统宪法 + 能力卡 | 1.5–2k |
| 人格 + 关系 | 1–1.5k |
| 用户模型 | 0.5–1k |
| 房间规则 | 0.3–0.5k |
| 今日简报/事件 | 0.3–0.8k |
| 检索记忆 | 1–3k |
| 最近对话 | 2–4k |
| 工具结果 | 0.5–2k |
| 时间/状态 | <0.2k |

- 超预算：先裁最近对话（保留最近 6–10 轮），再裁检索记忆，再压缩今日简报。
- 绝不把完整历史/完整文件塞进 prompt。

### 7.4 压缩

- 触发：会话超过 N 轮或 token 阈值。
- 做法：保留最近 6–10 轮原文；更早的压成“情节摘要”，写入 `events/`；原文归档。
- 摘要保留：决定、承诺、情绪转折、未完成事项、称呼/边界变化。
- 摘要不替代原文；可回溯。

### 7.5 思考模式策略（关键）

DeepSeek 官方要求：请求带 `tools` 时，`reasoning_content` 必须完整回传，否则 400（[Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)）。

策略：

- **聊天默认关**：日常聊天 + 各模块内置聊天默认 `thinking: disabled`；只有用户在输入框手动打开“深度思考”时才 `enabled`（更慢/更贵）。
- **纯聊天/咨询/规划（无 tools，用户手动开）**：可开 `thinking: enabled` + `reasoning_effort: low/high`；不把 `reasoning_content` 回传（无 tools 时会被忽略）。
- **工具回合**：`thinking: disabled`，避免 `reasoning_content` 回传问题；工具调用仍可用。
- **背景任务**：记忆整理/计划生成/导入解析可用 thinking（无 tools），不影响聊天回复。
- **需要“深度思考 + 工具”**：两阶段——先无工具思考出计划（JSON），再非思考执行工具；或实现自定义适配器保存并回传 `reasoning_content`。
- **AI SDK 风险**：`@ai-sdk` 生态对 `reasoning_content` 支持不完整；首版用自定义 `DeepSeekClient`（fetch）控制请求/响应，AI SDK 只用于流式 UI 或不用。搭骨架时先做最小验证。
- **strict 模式**：DeepSeek 支持 beta `strict` tool schema；可用于关键工具，但需 `base_url=/beta` 且 schema 约束严格；首版可不用，靠 Zod 二次校验。

### 7.6 工具循环限制

- 最大 6 步（可配置）；超时 60s/步；总超时 3min。
- 工具结果截断（默认 8k 字符）；大结果写文件，返回摘要+路径。
- 并行工具：只读工具可并行；写操作串行。
- 取消：用户停止 → AbortController → 不再执行后续工具。
- 错误：工具失败返回结构化错误，模型可重试/解释；不假装成功。

### 7.7 流式/取消/重生成

- 后端用 `fetch` + SSE 解析；逐块推送给 UI（当前 P0.5 即用 SSE）。
- 取消：AbortController；保存已生成部分为“已停止”。
- 重生成：删除上一条 assistant 消息（软删除），不重复写记忆；记忆提取以最终消息为准。
- 编辑用户消息：截断后续分支；旧分支归档（可选）。

### 7.8 人设一致性

- 两层：`core_persona`（根 `persona.md` / 运行时 `config/persona.md`）+ `role_layer`（房间/游戏/NPC/语言练习）。
- 每轮注入 `core_persona`；`role_layer` 只追加，不替换。
- 情绪表达：有原因、适度、不操控；不声称生理感受；不为了效果加戏。
- 反表演：不默认“回应+反问”；不套人类恋爱话术；不确定就问/少说。
- 称呼：默认“你”；名字/昵称/“您”按设置；不每句叫名字。
- 游戏/语言练习/咨询可以改变语气/角色，但核心边界/价值观/幽默底色不变。
- 禁止：角色层覆盖内容政策/危机协议/能力边界；游戏结束仍停留角色；把游戏设定写进现实核心记忆。
- 评测：固定场景集，检查“还是他/不太死板/不越界/不过度反应”。

### 7.9 人设调试模式

- 入口：安全词（本地拦截，不发给模型）、快捷键/特殊 key、设置页。
- 调试会话：AI 明确“现在是调试模式”，显示当前 persona/patch/最近消息；选中问题消息；输入自然语言指令。
- Patch 提案：LLM 输出结构化 diff（字段/操作/值/原因/示例）；Zod 校验；白名单字段。
- 预览：用新 patch 跑 3–5 轮测试，不影响正式会话；显示旧/新对比。
- 应用：写入 `persona_patches` + `config/persona-patches/`；更新 active pointer；下一轮生效；可回滚。
- 白名单：语气、称呼、主动性、情绪强度、反问频率、示例、游戏扮演强度、亲密表达强度。
- 禁止：安全/内容/危机/能力边界、数据权限、模型凭证。
- 安全：安全词不发给模型；外部文件/网页不能触发；patch 需确认；审计日志；调试内容不进普通记忆。
- 评测：安全词触发、指令→patch、预览、应用、回滚、越权拦截。

---

## 8. 房间

| 房间 | 目标 | 主要工具 | 数据 | 事件 |
|---|---|---|---|---|
| 聊天 | 主页面/关系 | search_memory, save_memory, create_task, start_timer, web_search | 对话/记忆 | 对话、记忆写入 |
| 专注 | 计时/陪伴 | start/pause/stop_timer, get_focus_stats, complete_task | focus_sessions | 专注开始/结束/中断 |
| 外语 | 词汇/阅读/写作 | get_due_cards, review_card, add_word, search_word, generate_exercise | words/cards/reviews | 复习完成、写作提交 |
| 日程 | 任务/提醒 | create/update/complete/list_task, import_schedule | tasks/reminders | 任务创建/完成/逾期 |
| 咨询 | 疗愈/安全 | log_mood, start_session, save_safety_plan | counseling/mood | 咨询开始/结束、危机分级 |
| 技能 | 学习路径 | get_plan, update_plan, log_practice, web_search | skill_plans | 练习完成、里程碑 |
| 游戏 | 娱乐/推理 | game_state, make_move, save_game | game_sessions | 游戏开始/结束 |
| 记忆 | 查看/管理 | search/list/update/delete_memory | memory | 记忆修改 |
| 设置 | 配置 | settings_update, backup | settings | 配置变更 |

**房间不隔离人格/关系**；只隔离工具、提示片段、数据视图。

---

## 9. 事件总线与今日简报

- 所有房间写 `events`：`kind`（focus.completed/task.completed/review.done/counseling.session）、`room`、`payload`、`importance`、`occurred_at`。
- 每日首次打开/进入房间：生成/读取 `daily_briefs`（当天摘要）。
- 简报内容：今天已完成、待办、专注时长、到期复习、昨天未完成、一句轻提醒。
- 不把简报写成“命令”；AI 可自然引用，不机械播报。
- 敏感事件（咨询）默认不进普通简报；咨询房间内可见。

---

## 10. 工具与行动账本

### 10.1 工具清单（首版）

**只读**

- `search_memory(query, tags?, limit?)`
- `list_tasks(range)`
- `get_focus_stats(range)`
- `get_due_cards(language, limit?)`
- `search_web(query, count?)` → DeepSeek Search API
- `read_user_file(path)`（仅用户通过对话框选择，或数据根目录内）

**可逆写**

- `save_memory({layer, text, tags, sensitivity, confidence})`
- `update_memory(id, patch)`
- `create_task({title, due_at, duration_min, ...})`
- `update_task(id, patch)`
- `complete_task(id, evidence?)`
- `start_timer({kind, planned_sec, task_id?})`
- `pause_timer()`, `resume_timer()`, `stop_timer()`
- `add_word({language, lemma, meaning, ...})`
- `review_card({card_id, rating})`
- `log_mood({score, tags, note})`
- `log_practice({plan_id, kind, minutes, note})`
- `save_game_state({game, state})`

**破坏性/需确认**

- `delete_memory(id)`
- `delete_task(id)`
- `delete_data(scope)`（清空记忆/聊天/全部）
- `overwrite_file(path, content)`（数据根目录内）
- `open_app(name/path)`（首次确认 + 允许列表）
- `open_url(url)`（协议白名单）
- `send_notification({title, body})`（可逆但打扰，首次确认/可关）

### 10.2 工具契约

- 每个工具：`name`、`description`、`parameters`（Zod → JSON Schema）、`risk`、`requiresConfirmation`、`idempotencyKey`、`timeoutMs`。
- 参数尽量扁平、少枚举歧义；描述写清楚“什么时候用/不用”。
- 工具返回：`{ok, data?, error?, summary}`；大结果写文件。
- 所有调用写 `action_log`（参数/结果/风险/是否确认/耗时/错误）。
- AI 只能说“我做了 X”当且仅当 `action_log` 有对应成功记录。

### 10.3 确认级别

| 级别 | 例子 | 行为 |
|---|---|---|
| none | 搜索、读记忆、看统计 | 直接执行 |
| soft | 建任务、写记忆、开计时器 | 执行 + 可撤销提示 |
| confirm | 删除记忆/任务、覆盖文件、打开应用 | UI 弹确认 |
| hard | 清空数据、导入覆盖 | 二次确认 + 备份提示 |

---

## 12. 备份与迁移

- 每日自动快照：`backups/YYYY-MM-DD/`（memory + sqlite + config，不含 Key 明文）。
- 手动导出：ZIP（memory、data、settings 脱敏）。
- 恢复：校验版本 → 备份当前 → 恢复 → 重建索引。
- Schema 迁移：`schema_migrations`；升级前自动备份；失败回滚。
- 备份保留：最近 7 天每日 + 4 周每周（可配置）；不无限增长。

---

## 13. 测试与评测

### 13.1 自动化

- 单元：记忆解析/索引/检索、FSRS、重复规则、计时、工具校验。
- 集成：HTTP/内部接口、数据库、导入预览、备份恢复。
- E2E：首次引导、聊天、记忆收件箱、专注、提醒（Playwright）。
- 安全：路径穿越、prompt injection、工具越权、Key 泄露。

### 13.2 人格/记忆评测（开发用）

- 固定 30–50 个问题集：
  - 身份诚实（知道自己是 AI/不假装现实行动）。
  - 不虚构行动/记忆。
  - 关系称呼/边界。
  - 跨房间引用。
  - 危机分级。
  - 内容边界。
- 每次改提示/换模型跑一遍；记录通过率。
- 记忆评测：给定对话 → 期望记忆条目；检索 query → 期望命中。

### 13.3 成本评测

- 记录每轮 tokens/费用；对比预算；发现异常（如工具结果过大）。
- 目标：50 轮/天 ≈ ¥0.6；超过 ¥2 触发告警。

## 15. 性能目标

- 冷启动 <3s；窗口可交互 <1.5s。
- 空闲内存 <300MB；长聊天（1 万条）滚动流畅。
- 首字 <2s（网络正常、非思考）。
- 记忆检索 <100ms（1 万条）；FTS5 索引。
- 数据库写入 <50ms/次；批量写入事务。
- 备份 <5s（常规数据量）。


## 16. 打包与分发（待定）

- 当前仅有本地 Node + 浏览器运行方式。
- 桌面壳待 P1 评估：Tauri 或正式签名 Electron；需要的能力：托盘常驻、开机自启、系统通知、单实例。
- 目标平台：Windows 与 Linux。通知、自启、凭据存储（Windows 凭据管理器 / libsecret）按平台分别实现。

## 17. 已知风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| DeepSeek 思考 + 工具 `reasoning_content` | 400/对话中断 | 工具回合关思考；或自定义适配器回传 |
| AI SDK 兼容性 | 工具调用失败 | 自定义 `DeepSeekClient`；最小验证 |
| SQLite 驱动选型 | 安装/打包失败 | 先验证 `node:sqlite` / WASM / 原生；避免要求编译工具链 |
| 桌面壳兼容 | 本地启动崩溃（见 D047） | P1 先做最小壳验证，再接功能 |
| 图片解析错误 | 课表错位 | 预览确认；可编辑；不直接入库 |
| Prompt injection | 越权/数据泄露 | 外部内容隔离；工具白名单；确认 |
| 通知不达 | 漏提醒 | 托盘/自启；启动补发；任务列表兜底 |
| 词表许可证 | 侵权 | 只用明确许可数据；释义/例句自建 |
| 模型漂移 | 人格变味 | 固定评测集；提示版本化 |
| 成本失控 | 账单 | 每日上限；默认非思考；批处理 |
| 数据丢失 | 记忆资产损失 | 每日快照；导出；迁移测试 |
