# API — 本地 HTTP 接口与工具契约

> 本文分两部分：**第一部分是当前已实现的 P0.5 本地 HTTP 接口（以 `server/index.mts` 与 `src/shared/types.ts` 为准）**；**第二部分是 P1 及以后的规划（工具契约、错误码、确认流程，尚未实现）**。
> 服务只监听 `127.0.0.1`，没有鉴权，不是对外 API。

# 第一部分：当前实现（P0.5）

## A1. 约定

- 基址：`http://127.0.0.1:4173`（`PORT` 环境变量可改）。
- 请求与响应均为 JSON（UTF-8），响应带 `Cache-Control: no-store`；请求体上限 5 MB。
- 出错：HTTP 4xx/5xx，body 为 `{ "error": string }`；未知路径返回 404。
- 前端通过 `window.lab`（`LabApi`，定义在 `src/shared/types.ts`）调用，由 `src/renderer/src/webLab.ts` 实现为下列 HTTP 请求。
- API Key 只经 `POST /api/settings` 进入服务进程内存，任何响应都不返回 Key，只返回 `hasApiKey`。

## A2. 接口一览

| 方法 | 路径 | `LabApi` 方法 | 请求 | 响应 |
|---|---|---|---|---|
| GET | `/api/settings` | `getSettings` | — | `PublicSettings` |
| POST | `/api/settings` | `saveSettings` | `SettingsSaveInput`（可含 `apiKey`） | `PublicSettings` |
| POST | `/api/clear-key` | `clearApiKey` | — | `PublicSettings` |
| GET | `/api/persona` | `getPersona` | — | `{ text, path }`（读取根目录 `persona.md`） |
| POST | `/api/chat` | `sendChat` | `ChatSendInput` | SSE 流 |
| POST | `/api/cancel` | `cancelChat` | `{ requestId }` | `{ cancelled }` |
| GET | `/api/debug/patches` | `listPatches` | — | `PersonaPatch[]`（新→旧） |
| POST | `/api/debug/propose` | `proposePatch` | `DebugProposeInput` | `PersonaPatchProposal` |
| POST | `/api/debug/preview` | `previewPatch` | `DebugPreviewInput` | `PreviewResult` |
| POST | `/api/debug/apply` | `applyPatch` | `DebugApplyInput` | `{ patch, settings, patches }` |
| POST | `/api/debug/revert` | `revertPatch` | `DebugRevertInput` | `{ settings, patches }` |

其余路径返回前端静态文件（`out/renderer`，找不到的路径回退到 `index.html`）。

## A3. 聊天 SSE

`POST /api/chat` 返回 `text/event-stream`，每条为 `data: <json>\n\n`：

```json
{ "type": "chunk", "text": "…" }
{ "type": "done" }
{ "type": "error", "error": "…" }
```

- 服务端事件不带 `requestId`，`webLab.ts` 在转成 `ChatEvent` 时补上。
- 演示模式（`demoMode` 为真或未配置 Key）由本地关键词回复，不访问网络。
- 否则调用 DeepSeek `chat/completions`（`deepseek-flash`，`stream: true`，`thinking: disabled`，`max_tokens: 1200`，`temperature: 0.7`）。
- 历史只取最近 20 条，过滤空消息和以 `[错误]` 开头的消息。
- 取消：`POST /api/cancel` 或客户端断开连接，都会中止上游请求，随后发送 `done`。

## A4. 核心类型

```ts
type AddressPreference = 'you' | 'name' | 'nickname' | 'formal';
type Relationship = 'couple' | 'friend' | 'family' | 'mentor' | 'custom';

interface LabSettings {
  aiName: string; aiNickname: string;
  userName: string; userNickname: string;
  addressPreference: AddressPreference;
  relationship: Relationship;
  safeWord: string;
  demoMode: boolean;
  activePatchIds: string[];
}
interface PublicSettings extends LabSettings { hasApiKey: boolean }
interface SettingsSaveInput extends LabSettings { apiKey?: string }

interface ChatSendInput { requestId: string; text: string; history: ChatMessage[] }
type ChatEvent =
  | { requestId: string; type: 'chunk'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; error: string };

interface PersonaPatchProposal { title: string; summary: string; rules: string[]; examples: string[] }
interface PersonaPatch extends PersonaPatchProposal {
  id: string; instruction: string; createdAt: string; active: boolean;
}
```

其余类型（`ChatMessage`、`PreviewSample`、`PreviewResult`、`Debug*Input`）见 `src/shared/types.ts`。

## A5. 调试接口的行为

- `propose`：DeepSeek JSON 模式（`max_tokens: 900`，`temperature: 0.4`）；服务端清洗，`rules` 至多 6 条、`examples` 至多 4 条；没有规则时报错。演示模式返回固定的演示提案。
- `preview`：`samples` 至多取 4 条；每条各生成“当前”和“套用提案后”两份回复；不写盘。
- `apply`：写 `config/persona-patches/<uuid>.json`（`rules` 至多 12 条、`examples` 至多 6 条），并加入 `activePatchIds`。
- `revert`：仅从 `activePatchIds` 移除，patch 文件保留。
- 设置文件 `config/web-settings.json` 不含 API Key。

---

# 第二部分：规划（P1 及以后，尚未实现）

> 以下是完整 app 的目标契约。传输层（HTTP / 桌面壳 IPC）待 P1 定；若有内部通道，一律采用“类型 + Zod 校验、白名单、`Result<T>` 返回”的约定。

## 3. 工具契约

Agent 工具使用 JSON Schema；后端用 Zod 再校验。示例：

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
  → 后端生成 confirmId + ConfirmationRequest
  → 前端弹窗（标题/说明/影响/参数摘要）
  → 用户批准/拒绝
  → 后端执行/拒绝
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


## 6. 安全要求（规划）

- 所有入口做 Zod 校验；未知字段拒绝。
- 文件操作只接受数据根目录内的相对路径，或用户通过系统文件对话框选择的路径（保存临时授权）。
- 路径规范化后必须仍在允许根目录内；拒绝 `..`、符号链接逃逸、UNC 异常路径（Windows）。
- 不向前端暴露 `fs`、`child_process` 等原始能力。
- 外链协议白名单：`https:`、`http:`（可选）、`mailto:`；拒绝 `file:`、`javascript:`。
- 日志脱敏：API Key、Authorization、cookie、用户私密内容（咨询）不进普通日志。

## 7. 版本与兼容

- 接口不兼容变更时递增 `apiVersion`。
- 工具 schema 变更：保留旧字段至少一个版本；必要时迁移。
- 数据库 schema 变更：见 ARCHITECTURE 的迁移策略。
