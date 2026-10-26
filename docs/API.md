# API — IPC 与工具契约

> 本项目没有对外 HTTP API。这里的 API 指 **渲染进程 ↔ 主进程的 IPC**，以及 **Agent ↔ 工具** 的契约。
> 所有输入输出都必须通过 TypeScript 类型 + Zod 校验；渲染进程不能直接访问文件/数据库/网络。

## 0. 约定

- API 版本：`apiVersion = 1`；不兼容变更时递增。
- 命名：`domain:action`，如 `chat:send`、`memory:list`。
- 所有 IPC 返回 `Result<T>`，不抛裸异常到渲染进程。
- 所有路径为绝对路径或数据根目录相对路径；主进程负责规范化/校验。
- 所有时间：ISO 8601 字符串（本地时区带偏移），数据库存 UTC + 时区偏移另存。
- 所有 ID：UUID v4（或 nanoid，统一一种）。
- 所有写操作带 `requestId`，用于幂等/取消/日志。

```ts
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

export interface AppError {
  code: ErrorCode;
  message: string;      // 用户可读中文
  detail?: string;      // 调试用，不含密钥
  retryable?: boolean;
}
```

## 1. IPC 通道

### 1.1 应用/设置

| 通道 | 输入 | 输出 |
|---|---|---|
| `app:get-state` | — | `AppState` |
| `app:open-data-folder` | — | `void` |
| `settings:get` | — | `Settings` |
| `settings:update` | `Partial<Settings>` | `Settings` |
| `settings:test-api-key` | `{ key?: string }` | `{ ok: boolean; model?: string; error?: string }` |
| `usage:get` | `{ range: 'today' \| 'month' }` | `UsageSummary` |
| `backup:create` | `{ kind: 'manual' \| 'auto' }` | `{ path: string; bytes: number }` |
| `backup:restore` | `{ path: string; confirm: true }` | `{ restored: boolean }` |

### 1.2 聊天

| 通道 | 输入 | 输出 |
|---|---|---|
| `chat:send` | `ChatSendInput` | `{ requestId: string }`（流式事件另行推送） |
| `chat:cancel` | `{ requestId: string }` | `{ cancelled: boolean }` |
| `chat:regenerate` | `{ messageId: string }` | `{ requestId: string }` |
| `chat:edit` | `{ messageId: string; content: string }` | `{ ok: true }` |
| `chat:history` | `{ conversationId?: string; before?: string; limit?: number }` | `Message[]` |
| `chat:search` | `{ query: string; limit?: number }` | `Message[]` |
| `chat:export` | `{ conversationId?: string; format: 'md' \| 'json' }` | `{ path: string }` |

流式事件（主 → 渲染）：

```ts
type ChatStreamEvent =
  | { type: 'start'; requestId: string; messageId: string }
  | { type: 'delta'; requestId: string; text: string }
  | { type: 'reasoning'; requestId: string; text: string } // 可选，折叠展示
  | { type: 'tool'; requestId: string; name: string; status: 'running' \| 'done' \| 'error'; summary?: string }
  | { type: 'confirm'; requestId: string; confirmId: string; request: ConfirmationRequest }
  | { type: 'usage'; requestId: string; tokensIn: number; tokensOut: number; costUsd: number }
  | { type: 'done'; requestId: string; messageId: string; finishReason: string }
  | { type: 'error'; requestId: string; error: AppError };
```

### 1.3 记忆

| 通道 | 输入 | 输出 |
|---|---|---|
| `memory:list` | `MemoryQuery` | `{ items: Memory[]; total: number }` |
| `memory:search` | `{ query: string; limit?: number; includeSensitive?: boolean }` | `Memory[]` |
| `memory:update` | `{ id: string; patch: Partial<Memory> }` | `Memory` |
| `memory:delete` | `{ id: string; confirm: true }` | `{ deleted: boolean }` |
| `memory:merge` | `{ ids: string[]; text: string }` | `Memory` |
| `memory:inbox` | `{ limit?: number }` | `Memory[]` |
| `memory:accept` | `{ id: string }` | `Memory` |
| `memory:reject` | `{ id: string }` | `{ rejected: boolean }` |
| `memory:rebuild-index` | — | `{ count: number }` |
| `memory:export` | `{ format: 'md' \| 'json' \| 'zip' }` | `{ path: string }` |

### 1.4 关于你（用户模型）

| 通道 | 输入 | 输出 |
|---|---|---|
| `user-model:get` | — | `UserModel` |
| `user-model:update` | `{ id: string; patch: Partial<Trait> }` | `UserModel` |
| `user-model:delete` | `{ id: string }` | `UserModel` |
| `user-model:confirm` | `{ id: string; accepted: boolean }` | `UserModel` |

### 1.5 日程

| 通道 | 输入 | 输出 |
|---|---|---|
| `task:list` | `{ range: 'today' \| 'week' \| 'month' \| 'all' }` | `Task[]` |
| `task:create` | `TaskInput` | `Task` |
| `task:update` | `{ id: string; patch: Partial<TaskInput> }` | `Task` |
| `task:delete` | `{ id: string; confirm: true }` | `{ deleted: boolean }` |
| `task:complete` | `{ id: string; evidence?: string }` | `Task` |
| `task:snooze` | `{ id: string; minutes: number }` | `Task` |
| `schedule:import-preview` | `{ path: string; kind: 'image' \| 'excel' \| 'pdf' \| 'word' \| 'text' }` | `ImportPreview` |
| `schedule:import-commit` | `{ previewId: string; items: ImportItem[] }` | `{ created: number; skipped: number }` |

### 1.6 专注

| 通道 | 输入 | 输出 |
|---|---|---|
| `focus:start` | `{ kind: 'up' \| 'down' \| 'pomodoro'; plannedSec?: number; taskId?: string }` | `FocusSession` |
| `focus:pause` | — | `FocusSession` |
| `focus:resume` | — | `FocusSession` |
| `focus:stop` | `{ reason?: string }` | `FocusSession` |
| `focus:current` | — | `FocusSession \| null` |
| `focus:stats` | `{ range: 'today' \| 'week' \| 'month' }` | `FocusStats` |

### 1.7 外语

| 通道 | 输入 | 输出 |
|---|---|---|
| `language:goals` | `{ language: 'en' \| 'ja' }` | `LanguageGoal` |
| `language:update-goals` | `{ language: 'en' \| 'ja'; patch: Partial<LanguageGoal> }` | `LanguageGoal` |
| `language:packs` | `{ language?: 'en' \| 'ja' }` | `WordPack[]` |
| `language:due` | `{ language: 'en' \| 'ja'; limit?: number }` | `Card[]` |
| `language:review` | `{ cardId: string; rating: 1 \| 2 \| 3 \| 4 }` | `Card` |
| `language:add-word` | `WordInput` | `Word` |
| `language:lookup` | `{ word: string; language: 'en' \| 'ja' }` | `WordLookup` |
| `language:import-csv` | `{ path: string; language: 'en' \| 'ja' }` | `{ imported: number; skipped: number }` |
| `language:writing-feedback` | `{ prompt: string; draft: string; exam?: 'ielts' \| 'toefl' \| 'cet' }` | `WritingFeedback` |

### 1.8 心理咨询

| 通道 | 输入 | 输出 |
|---|---|---|
| `counseling:start` | `{ mode?: CounselingMode }` | `CounselingSession` |
| `counseling:end` | `{ sessionId: string }` | `CounselingSession` |
| `counseling:mood` | `{ score: number; tags?: string[]; note?: string }` | `MoodLog` |
| `counseling:safety-plan` | `{ content: SafetyPlan }` | `SafetyPlan` |
| `counseling:unlock` | `{ password: string }` | `{ ok: boolean }` |
| `counseling:lock` | — | `{ locked: boolean }` |

### 1.9 技能/游戏

| 通道 | 输入 | 输出 |
|---|---|---|
| `skill:plans` | — | `SkillPlan[]` |
| `skill:create` | `{ topic: string; goal: string; level?: string; minutesPerWeek?: number }` | `SkillPlan` |
| `skill:update` | `{ id: string; patch: Partial<SkillPlan> }` | `SkillPlan` |
| `skill:log-practice` | `{ planId: string; kind: string; minutes: number; note?: string }` | `PracticeLog` |
| `game:list` | — | `GameInfo[]` |
| `game:start` | `{ game: 'gomoku' \| 'textquest' \| 'story' \| 'textgeo' \| 'turtle' \| 'twentyq' }` | `GameSession` |
| `game:move` | `{ sessionId: string; move: unknown }` | `GameSession` |
| `game:save` | `{ sessionId: string }` | `{ saved: boolean }` |
| `game:load` | `{ sessionId: string }` | `GameSession` |

### 1.10 确认

| 通道 | 输入 | 输出 |
|---|---|---|
| `confirm:respond` | `{ confirmId: string; approved: boolean; remember?: boolean }` | `{ ok: boolean }` |

### 1.11 人格 / 调试

| 通道 | 输入 | 输出 |
|---|---|---|
| `persona:get` | — | `PersonaProfile` |
| `persona:update` | `Partial<PersonaProfile>` | `PersonaProfile` |
| `debug:enter` | `{ source: 'safeword' \| 'hotkey' \| 'settings'; passphrase?: string }` | `DebugSession` |
| `debug:exit` | — | `{ ok: true }` |
| `debug:state` | — | `DebugSession` |
| `debug:propose-patch` | `{ instruction: string; messageId?: string }` | `PersonaPatchProposal` |
| `debug:preview` | `{ patchId: string; messages: string[] }` | `PreviewResult` |
| `debug:apply` | `{ patchId: string; confirm: true }` | `PersonaPatch` |
| `debug:revert` | `{ patchId?: string }` | `PersonaProfile` |
| `debug:list-patches` | — | `PersonaPatch[]` |

## 2. 核心类型（节选）

```ts
export interface Settings {
  apiKeyConfigured: boolean;
  demoMode: boolean;
  model: string;                 // 'deepseek-flash'
  chatThinking: 'off' | 'on-demand';  // 聊天默认 off；on-demand = 输入框可手动开 high
  dailyBudgetCny: number;        // 默认 2
  dataRoot: string;              // 默认工作区
  proactive: {
    mode: 'off' | 'low' | 'normal' | 'high' | 'companion' | 'custom';
    intervalMin?: number;        // custom 时使用
    quietHours: [string, string];
  };
  notifications: { enabled: boolean; sound: boolean; quietHours: [string, string] };
  dnd: { until?: string; hardReminders: boolean };
  debug: { enabled: boolean; safeWordSet: boolean; hotkey: string; requirePassphrase: boolean };
  privateRoomLocked: boolean;
  ageConfirmed: boolean;
}

export interface PersonaProfile {
  aiName: string;                 // 应用内设置，必填
  aiNickname?: string;            // 可选；用户给 AI 的昵称
  userName?: string;
  userNickname?: string;
  addressPreference: 'name' | 'nickname' | 'you' | 'formal';
  relationship: 'couple' | 'friend' | 'family' | 'mentor' | 'custom';
  ageRange?: '21-27' | string;
  baseVersion: string;
  activePatchIds: string[];
}

export interface PersonaPatchProposal {
  id: string;
  instruction: string;
  diff: Array<{
    field: string;                // 白名单字段
    op: 'set' | 'append' | 'remove';
    value: string | number | boolean;
    reason: string;
  }>;
  examples: string[];             // 2–3 条示例回复
  warnings?: string[];
}

export interface PersonaPatch extends PersonaPatchProposal {
  status: 'active' | 'archived' | 'rejected';
  createdAt: string;
  appliedAt?: string;
  revertedAt?: string;
}

export interface DebugSession {
  active: boolean;
  source?: 'safeword' | 'hotkey' | 'settings';
  startedAt?: string;
  selectedMessageId?: string;
  currentPatchIds: string[];
}

export interface PreviewResult {
  patchId: string;
  samples: Array<{ input: string; before: string; after: string }>;
}

export interface ChatSendInput {
  conversationId?: string;
  room: RoomId;
  text: string;
  attachments?: { kind: 'image' | 'file'; path: string }[];
  thinking?: 'off' | 'low' | 'high';  // 默认 off；只有用户手动开才 high
  requestId?: string;
}

export type RoomId =
  | 'chat' | 'focus' | 'language:en' | 'language:ja'
  | 'schedule' | 'counseling' | 'skills' | 'games' | 'memory' | 'settings';

export interface Memory {
  id: string;
  layer: 'core' | 'episodic' | 'semantic' | 'sensitive';
  kind: string;
  text: string;
  tags: string[];
  sensitivity: 'normal' | 'sensitive' | 'private';
  confidence: number;            // 0..1
  source: 'user' | 'ai' | 'event';
  sourceRef?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQuery {
  layer?: Memory['layer'];
  tag?: string;
  query?: string;
  includeSensitive?: boolean;
  limit?: number;
  offset?: number;
}

export interface TaskInput {
  title: string;
  notes?: string;
  dueAt?: string;
  durationMin?: number;
  priority?: 0 | 1 | 2 | 3;
  tags?: string[];
  recurrence?: Recurrence;
  condition?: TaskCondition;
}

export type TaskCondition =
  | { kind: 'manual' }
  | { kind: 'focus'; minutes: number; tag?: string }
  | { kind: 'ai-confirm' }
  | { kind: 'all'; conditions: TaskCondition[] };

export interface FocusSession {
  id: string;
  kind: 'up' | 'down' | 'pomodoro';
  plannedSec?: number;
  elapsedSec: number;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  taskId?: string;
}

export interface UsageSummary {
  date: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  costCny: number;
  budgetCny: number;
  byRoom: Record<string, { tokensIn: number; tokensOut: number; costCny: number }>;
}
```

## 3. 工具契约

Agent 工具使用 JSON Schema；主进程用 Zod 再校验。示例：

### 3.1 `save_memory`

```json
{
  "name": "save_memory",
  "description": "保存一条关于用户的长期记忆。只在用户明确表达事实/偏好/边界时使用；不要保存一次性闲聊。",
  "parameters": {
    "type": "object",
    "properties": {
      "layer": { "type": "string", "enum": ["core", "episodic", "semantic", "sensitive"] },
      "text": { "type": "string", "description": "一句完整、可独立理解的话" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "sensitivity": { "type": "string", "enum": ["normal", "sensitive", "private"] },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    },
    "required": ["layer", "text", "sensitivity", "confidence"],
    "additionalProperties": false
  },
  "risk": "soft",
  "requiresConfirmation": false
}
```

### 3.2 `create_task`

```json
{
  "name": "create_task",
  "description": "创建一个待办。用户没有明确确认要排进日程时，不要调用；先问。",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "dueAt": { "type": "string", "description": "ISO 8601；没有明确日期则省略" },
      "durationMin": { "type": "integer", "minimum": 5, "maximum": 720 },
      "priority": { "type": "integer", "minimum": 0, "maximum": 3 },
      "condition": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "enum": ["manual", "focus", "ai-confirm"] },
          "minutes": { "type": "integer" }
        },
        "required": ["kind"],
        "additionalProperties": false
      }
    },
    "required": ["title"],
    "additionalProperties": false
  },
  "risk": "soft",
  "requiresConfirmation": false
}
```

### 3.3 `start_timer`

```json
{
  "name": "start_timer",
  "description": "开始专注计时。若已有进行中的计时，先询问是否结束。",
  "parameters": {
    "type": "object",
    "properties": {
      "kind": { "type": "string", "enum": ["up", "down", "pomodoro"] },
      "plannedSec": { "type": "integer", "minimum": 60, "maximum": 14400 },
      "taskId": { "type": "string" }
    },
    "required": ["kind"],
    "additionalProperties": false
  },
  "risk": "soft",
  "requiresConfirmation": false
}
```

### 3.4 `search_web`

```json
{
  "name": "search_web",
  "description": "联网搜索。只在需要最新信息/资源/例句时使用；回复中必须给出链接。",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "maxLength": 128 },
      "count": { "type": "integer", "minimum": 1, "maximum": 10 }
    },
    "required": ["query"],
    "additionalProperties": false
  },
  "risk": "none",
  "requiresConfirmation": false
}
```

### 3.5 `delete_memory`

```json
{
  "name": "delete_memory",
  "description": "删除一条记忆。必须用户明确要求；执行前必须确认。",
  "parameters": {
    "type": "object",
    "properties": { "id": { "type": "string" } },
    "required": ["id"],
    "additionalProperties": false
  },
  "risk": "hard",
  "requiresConfirmation": true
}
```

### 3.6 工具注册表规则

- 工具描述必须写：何时用、何时不用、失败怎么办。
- 工具名唯一、动词开头、参数扁平。
- 同一功能不要暴露多个重叠工具。
- 工具结果：`{ ok, summary, data?, error? }`；`summary` 给模型看，`data` 给 UI。
- 工具超时/重试：只读可重试 1 次；写操作不自动重试（避免重复）。
- 工具幂等：`idempotencyKey = requestId + tool + argsHash`；写操作记录。

## 4. 错误码

| 码 | 含义 | 用户提示 | 可重试 |
|---|---|---|---|
| `AUTH_MISSING` | 未配置 Key | 去设置里填 API Key，或先用演示模式 | 否 |
| `AUTH_INVALID` | Key 无效 | Key 无效/已撤销，请重新生成 | 否 |
| `BALANCE_EMPTY` | 余额不足 | 去 DeepSeek 平台充值 | 否 |
| `RATE_LIMIT` | 限流 | 稍后再试 | 是 |
| `NETWORK` | 网络失败 | 检查网络/代理 | 是 |
| `TIMEOUT` | 超时 | 重试/简化请求 | 是 |
| `BUDGET_EXCEEDED` | 超过每日上限 | 提高上限或明天再试；本地功能可用 | 否 |
| `VALIDATION` | 参数不合法 | 这是程序问题；记录日志 | 否 |
| `TOOL_DENIED` | 工具被拒绝 | 用户拒绝/权限不足 | 否 |
| `CONFIRM_REQUIRED` | 需要确认 | 弹确认框 | 是（确认后） |
| `PATH_DENIED` | 路径越权 | 只能访问数据目录/已选文件 | 否 |
| `CONTENT_BLOCKED` | 内容边界 | 说明边界，提供替代 | 否 |
| `CRISIS` | 危机协议触发 | 显示求助资源 | 否 |
| `INTERNAL` | 未知错误 | 记录日志；重启试试 | 视情况 |

## 5. 确认流程

```text
模型请求危险工具
  → 主进程生成 confirmId + ConfirmationRequest
  → 渲染进程弹窗（标题/说明/影响/参数摘要）
  → 用户批准/拒绝
  → 主进程执行/拒绝
  → 写 action_log（confirmed=true/false）
  → 结果回传模型
```

`ConfirmationRequest`：

```ts
interface ConfirmationRequest {
  confirmId: string;
  title: string;
  description: string;
  risk: 'soft' | 'confirm' | 'hard';
  preview?: string;        // 参数摘要，不含敏感值
  rememberable?: boolean;  // 是否允许“以后都允许”
}
```

## 6. 安全要求（IPC）

- 所有通道在主进程注册时做 Zod 校验；未知字段拒绝。
- 渲染进程不能传任意路径；文件操作只接受：
  - 数据根目录内的相对路径；或
  - 用户通过系统文件对话框选择的路径（主进程保存临时授权）。
- 路径规范化后必须仍在允许根目录内；拒绝 `..`、符号链接逃逸、UNC 异常路径。
- 不把 `ipcRenderer`、`fs`、`child_process` 暴露给渲染进程。
- 所有外链协议白名单：`https:`、`http:`（可选）、`mailto:`；拒绝 `file:`、`javascript:`。
- 日志脱敏：API Key、Authorization、cookie、用户私密内容（咨询）不进普通日志。

## 7. 版本与兼容

- `apiVersion` 变更时，主进程启动检查渲染进程版本；不匹配提示重启/更新。
- 工具 schema 变更：保留旧字段至少一个版本；必要时迁移。
- 数据库 schema 变更：见 ARCHITECTURE 的迁移策略。
