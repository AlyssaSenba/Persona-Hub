# RESEARCH — 社区调研与参考

> 目的：避免重复造轮子；看看别人怎么解决“桌面陪伴 + 长期记忆 + 多场景 + 上下文膨胀”。
> 结论只代表 2026-10 的调研；链接可能变化。

## 1. 调研问题

1. 桌面 AI 伙伴/桌宠通常怎么搭？Electron 还是 Tauri？要不要 Live2D/语音？
2. 长期记忆怎么做才“记得住、不黑盒、不越聊越乱”？
3. 上下文膨胀/变笨/变贵，社区的最佳实践是什么？
4. DeepSeek Flash 能不能扛住工具调用、视觉、搜索、长上下文？有什么坑？
5. 外语学习/间隔重复，有没有成熟算法/数据？
6. “图寻”这类小游戏的核心是什么？纯文字能不能做？
7. 心理陪伴/危机处理，社区/官方有什么底线？
8. 对一个 vibe coding 小白，哪套技术栈最稳？

---

## 2. 桌面伙伴/桌宠

### 参考

- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)：跨平台、Live2D、TTS/ASR、桌宠模式（透明置顶、点击穿透）、本地/离线、MCP、多 LLM。
- [Desktop-pet](https://github.com/git2968/Desktop-pet)：Electron + Live2D + AI 对话 + 人设 + 语音输入 + MCP。
- [gogh: Focus with Your Avatar](https://store.steampowered.com/app/3213850/gogh_Focus_with_Your_Avatar/)：虚拟形象 + 专注房间 + 番茄钟 + 环境音 + 养成。
- [Electron vs Tauri 调研](https://github.com/CrazySwami/cross-platform-web-app-research)。

### 结论

- Electron 是这类应用的主流；Live2D/桌宠/语音都能做，但会显著增加授权、美术、性能、调试成本。
- gogh 的沉浸感很大程度来自视觉/场景/声音；纯文字要另想办法补（时间、背景、文案、状态、UI 音效）。
- 我们选择 **Electron + 纯文字 + 氛围背景**，把复杂度留给记忆/模块，而不是美术。

### 采纳/拒绝

- 采纳：Electron、托盘/桌宠的“陪伴”理念、专注房间的仪式感。
- 拒绝（首版）：Live2D/VRM、桌宠透明置顶、TTS/ASR、环境音。

---

## 3. 长期记忆

### 参考

- [ST-Bionic-Memory-Ecology (BME)](https://github.com/Youzini-afk/ST-Bionic-Memory-Ecology)：SillyTavern 扩展；自动提取角色/事件/地点/规则/主线/反思；图谱 + 向量 + 词法 + 重排；总结/压缩/遗忘；历史安全（删楼/编辑/swipe 回滚）。
- [Basic Memory](https://basicmemory.com/blog/year-1-basic-memory)：Markdown-first、本地优先、可被 Obsidian 编辑。
- [mem0](https://github.com/mem0ai/mem0)、[Letta](https://github.com/letta-ai/letta)：托管式记忆层，功能强但更重、更黑盒。
- [SillyTavern Character Cards v2](https://github.com/bradennapier/character-cards-v2)：角色卡字段/世界书的社区实践。

### 结论

- “记得住”不是把历史塞进 prompt，而是：**提取 → 结构化 → 召回 → 总结 → 遗忘**。
- Markdown-first 让用户可看/可改/可迁移；比纯向量库更适合“供全局查看”的需求。
- 社区已经证明：图谱/混合召回很强，但复杂度高；个人项目应先做“文件 + 索引 + 收件箱”。
- 历史安全（用户编辑/删除后回滚索引）是容易被忽略的坑。

### 采纳/拒绝

- 采纳：分层记忆、自动提取、收件箱、摘要、去重/冲突、可编辑 Markdown、来源/置信度。
- 拒绝（首版）：完整知识图谱、向量检索、复杂重排、自动遗忘（先归档不删除）。

---

## 4. 上下文工程

### 参考

- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)：compaction、structured note-taking、sub-agent、just-in-time retrieval、context rot。
- [Chroma: Context Rot](https://www.trychroma.com/research/context-rot)：18 个模型；输入越长，检索/推理越不稳；“focused input”显著优于“full input”。

### 结论

- 1M 上下文是安全网，不是策略；塞满会降智、变贵。
- 最佳实践：最小高信号上下文 + 压缩 + 按需检索 + 结构化笔记。
- 稳定前缀放前面有利于缓存；动态内容放后面。

### 采纳/拒绝

- 采纳：8–12k 预算、滚动摘要、top-k 检索、事件/今日简报、缓存友好排序。
- 拒绝：全量 1M、每轮把完整历史/文件塞进去。

---

## 5. DeepSeek Flash

### 参考

- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)：`deepseek-flash` = V4.1-Flash-1017；1M 上下文；工具/JSON/视觉/搜索；缓存命中很便宜。
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)：`thinking: {type: enabled/disabled}`、`reasoning_effort: low/high/max`；带 tools 时必须回传 `reasoning_content`，否则 400。
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)：OpenAI 兼容；`strict` 模式 beta。
- [Vision](https://api-docs.deepseek.com/guides/vision)：JPEG/PNG/GIF/WebP；图片最多约 1024 tokens；只支持 user 消息。
- [Search & Fetch](https://api-docs.deepseek.com/guides/search)：`/v1/tools/search`、`/v1/tools/fetch`；按成功请求计费。
- 兼容性坑：[openai-agents-js #791](https://github.com/openai/openai-agents-js/issues/791)（Missing reasoning_content）、[vercel/ai #7924](https://github.com/vercel/ai/issues/7924)（OpenAI-compatible tools schema）。

### 结论

- Flash 很适合这个项目：便宜、1M、工具、视觉、搜索都有。
- **最大的坑是“思考模式 + 工具”**：必须回传 reasoning_content；很多框架没处理好。
- 我们选择：工具回合关思考；纯聊天/咨询/规划开思考；需要“深度 + 工具”时两阶段。
- 图片课表可以直接用视觉解析，不必上本地 OCR。

### 采纳/拒绝

- 采纳：DeepSeek Flash、视觉解析、搜索 API、缓存友好、非思考工具回合。
- 拒绝（首版）：全 high、AI SDK 默认适配、strict 模式（可后续）。

---

## 6. 外语学习 / 间隔重复

### 参考

- [Anki FSRS](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm)：现代间隔重复算法，优于 SM-2。
- [ts-fsrs](https://www.npmjs.com/package/ts-fsrs)：TypeScript 实现。

### 结论

- FSRS 是成熟选择；`ts-fsrs` 可直接用；需要存 stability/difficulty/due/reps/lapses。
- 词表不是词典：词表用于背诵；查词用 AI 联网。
- 考试首版做词汇 + 阅读 + 写作；听力/口语后做（音频版权/工程）。

### 采纳/拒绝

- 采纳：FSRS、每日新词/复习上限、到期队列、CSV 导入。
- 拒绝（首版）：AI 语音、口语评分、听力播放器、离线词典。

---

## 7. 词表数据

### 参考

- [KyleBing/dict](https://github.com/KyleBing/dict)：四六级/考研/雅思/托福/SAT/GMAT/GRE 等词表。
- [genkin-he/english-vocabulary](https://github.com/genkin-he/english-vocabulary)：CET4/CET6/考研/SAT，txt/json。
- [Bluskyo/JLPT_Vocabulary](https://github.com/Bluskyo/JLPT_Vocabulary)：JLPT N1–N5，JSON/CSV；数据来自 tanos.co.uk，**CC BY**（需署名 Jonathan Waller）。
- [ECDICT](https://github.com/skywind3000/ECDICT)：英汉词典数据库，**MIT**；可用于释义/音标。

### 结论

- 词表本身（word list）通常是事实性数据；但释义/例句可能受版权保护。
- 建议：开源词表 + ECDICT 释义 + AI 按需生成例句（不抄词典例句）。
- 许可证要逐个确认；无许可证的仓库只用作“词表种子”，不直接复制其释义/例句。
- 词表字段：lemma、phonetic、pos、meaning_zh、example、example_zh、tags、level、frequency。

### 采纳/拒绝

- 采纳：雅思、四级、JLPT N5–N1、日常/工作编程；CSV 导入；按需例句。
- 拒绝（首版）：六级/考研/托福内置（后续去重合并）；Anki .apkg 导入（复杂）。

---

## 8. 小游戏 / 图寻

### 参考

- [游民星空：图寻介绍](https://wap.gamersky.com/news/Content-2043172.html)：图寻 = GeoGuessr 式地理推理；给图片线索 → 猜地点；社区有猜游戏场景/番剧等变体；核心是“线索 → 唯一答案”。
- GeoGuessr/Lostgamer 社区地图/挑战。

### 结论

- 图寻的核心不是图片，而是“线索 → 答案”的推理乐趣；纯文字完全可做。
- 适合文字聊天的变体：文字图寻、海龟汤、AI 二十问、猜词/成语、故事接龙、文字冒险。
- 棋类需要规则引擎；五子棋最简单，适合首版。

### 采纳/拒绝

- 采纳：文字图寻、海龟汤、二十问、五子棋、文字冒险、故事接龙。
- 拒绝（首版）：图片版权库、你画我猜（画布）、国际象棋（Stockfish GPL/引擎）。

---

## 9. 心理陪伴与危机

### 参考

- [人民网：12356 全国心理援助热线](http://health-app.people.cn/n1/2025/1226/c14739-40633211.html)：2025 年各地开通；已接通 70 万+ 通；危机干预近 1 万起。
- [The fragility of AI companionship](https://www.sciencedirect.com/science/article/abs/pii/S1071581926001722)：AI 陪伴的本体/结构/规范不确定性。
- 心理学自助书籍/疗法：CBT、ACT、人本、正念（用于心理教育，不作为诊断）。

### 结论

- 关键不是“像咨询师”，而是：非诊断、边界、危机协议、隐私、依赖防护。
- 12356 是中国大陆的全国心理援助热线；紧急情况 110/120。
- AI 不能假装能打电话/上门；不能承诺绝对保密；高风险时优先安全。
- 陪伴越强，越要防止排他/依赖/操控。

### 采纳/拒绝

- 采纳：0–3 级危机协议、12356/110/120、非诊断声明、私密房间、依赖防护。
- 拒绝：诊断、药物建议、替代治疗、模拟危机留人。

---

## 10. 桌面技术选型

### 参考

- [Electron vs Tauri 调研](https://github.com/CrazySwami/cross-platform-web-app-research)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

### 结论

- Electron：生态成熟、Node API、调试资料多；包大/内存高。
- Tauri：更轻，但 Rust 工具链、插件生态、排错门槛更高。
- 对“小白 + 快速迭代 + Windows 通知/托盘/文件”，Electron 更稳。

### 采纳/拒绝

- 采纳：Electron + React + TS。
- 拒绝（首版）：Tauri。

---

## 11. 我们采纳了什么

- 一个 AI、多个房间（产品立意）。
- Markdown-first 记忆 + SQLite 索引。
- 自动提取 + 收件箱 + 来源/置信度。
- 分层上下文 + 摘要 + 检索（反 context rot）。
- 行动账本 + 能力卡（反假承诺）。
- 用户模型可见可改（反贴标签）。
- DeepSeek Flash + 非思考工具回合。
- FSRS + 开源词表 + AI 例句。
- 文字图寻/海龟汤/二十问/五子棋。
- 0–3 级危机 + 12356 + 非诊断。
- Electron + 托盘/开机自启/Windows 通知。

## 12. 我们拒绝了什么

- Live2D/VRM/桌宠/语音/环境音（首版）。
- 全量 1M 上下文。
- mem0/Letta 作为主记忆层。
- LangGraph/Mastra。
- Tauri。
- 本地 OCR（中文课表）。
- 爬第三方词典。
- AI 配音口语。
- 应用/网站屏蔽。
- ICS。
- 在线多人游戏。
- 开源/分发（当前）。

## 13. 还没解决的问题

1. 各词表仓库的具体许可证（KyleBing/dict 等需逐个确认）。
2. 雅思/托福阅读/写作题库来源与版权。
3. 塔罗牌义/牌阵内容的原创/引用边界。
4. 心理模块参考书的引用方式（观点可引用，原文不逐字复制）。
5. 五子棋 AI 难度/禁手规则。
6. Windows 通知在开发模式/打包后的表现。
7. `better-sqlite3` 在 Electron 的构建稳定性。
8. DeepSeek 思考 + 工具的最终适配方案（非思考/两阶段/自定义适配器）。
9. Prompt injection 的实际测试集。
10. 人设内容（等用户提供）。
