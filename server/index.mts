import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ChatSendInput,
  DebugApplyInput,
  DebugPreviewInput,
  DebugProposeInput,
  DebugRevertInput,
  LabSettings,
  PersonaPatch,
  PersonaPatchProposal,
  SettingsSaveInput,
} from '../src/shared/types.ts';
import {
  buildPatchProposalPrompt,
  buildPreviewSystemPrompt,
  buildSystemPrompt,
} from './persona.ts';

const PORT = Number(process.env.PORT) || 4173;
const ROOT = process.cwd();
const CONFIG_DIR = path.join(ROOT, 'config');
const PATCH_DIR = path.join(CONFIG_DIR, 'persona-patches');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'web-settings.json');
const PERSONA_FILE = path.join(ROOT, 'persona.md');
const RENDERER_DIR = path.join(ROOT, 'out', 'renderer');

const DEFAULT_SETTINGS: LabSettings = {
  aiName: '伙伴',
  aiNickname: '',
  userName: '',
  userNickname: '',
  addressPreference: 'you',
  relationship: 'couple',
  safeWord: '',
  demoMode: true,
  activePatchIds: [],
};

let apiKey: string | null = null;
const controllers = new Map<string, AbortController>();

function ensureDirs(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(PATCH_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDirs();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadSettings(): LabSettings {
  const raw = readJson<Partial<LabSettings>>(SETTINGS_FILE, {});
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    activePatchIds: Array.isArray(raw.activePatchIds) ? raw.activePatchIds : [],
  };
}

function saveSettings(input: SettingsSaveInput): LabSettings {
  const current = loadSettings();
  const next: LabSettings = {
    aiName: String(input.aiName ?? current.aiName).trim() || DEFAULT_SETTINGS.aiName,
    aiNickname: String(input.aiNickname ?? current.aiNickname).trim(),
    userName: String(input.userName ?? current.userName).trim(),
    userNickname: String(input.userNickname ?? current.userNickname).trim(),
    addressPreference: input.addressPreference ?? current.addressPreference,
    relationship: input.relationship ?? current.relationship,
    safeWord: String(input.safeWord ?? current.safeWord).trim(),
    demoMode: Boolean(input.demoMode),
    activePatchIds: current.activePatchIds,
  };
  if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    apiKey = input.apiKey.trim();
  }
  writeJson(SETTINGS_FILE, next);
  return next;
}

function publicSettings(settings: LabSettings): LabSettings & { hasApiKey: boolean } {
  return { ...settings, hasApiKey: Boolean(apiKey) };
}

function getPersonaText(): { text: string; path: string } {
  try {
    return { text: fs.readFileSync(PERSONA_FILE, 'utf8'), path: PERSONA_FILE };
  } catch {
    return {
      path: PERSONA_FILE,
      text: '# persona.md\n\n（未找到 persona.md。请把 persona.md 放在项目根目录。）\n',
    };
  }
}

function patchFile(id: string): string {
  return path.join(PATCH_DIR, `${id}.json`);
}

function listPatches(): PersonaPatch[] {
  ensureDirs();
  const settings = loadSettings();
  const active = new Set(settings.activePatchIds);
  if (!fs.existsSync(PATCH_DIR)) return [];
  return fs
    .readdirSync(PATCH_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      try {
        const patch = JSON.parse(fs.readFileSync(path.join(PATCH_DIR, name), 'utf8')) as PersonaPatch;
        return { ...patch, active: active.has(patch.id) };
      } catch {
        return null;
      }
    })
    .filter((item): item is PersonaPatch => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function activePatches(): PersonaPatch[] {
  return listPatches().filter((patch) => patch.active);
}

function savePatch(proposal: PersonaPatchProposal, instruction: string): PersonaPatch {
  ensureDirs();
  const patch: PersonaPatch = {
    id: randomUUID(),
    title: proposal.title.trim() || '未命名 patch',
    summary: proposal.summary.trim(),
    rules: proposal.rules.map((rule) => rule.trim()).filter(Boolean).slice(0, 12),
    examples: proposal.examples.map((example) => example.trim()).filter(Boolean).slice(0, 6),
    instruction: instruction.trim(),
    createdAt: new Date().toISOString(),
    active: true,
  };
  writeJson(patchFile(patch.id), patch);
  const settings = loadSettings();
  if (!settings.activePatchIds.includes(patch.id)) settings.activePatchIds.push(patch.id);
  writeJson(SETTINGS_FILE, settings);
  return patch;
}

function deactivatePatch(patchId: string): LabSettings {
  const settings = loadSettings();
  settings.activePatchIds = settings.activePatchIds.filter((id) => id !== patchId);
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

function demoReply(text: string): string {
  if (/累|疲惫|困|加班/.test(text)) return '嗯，辛苦了。先歇着，不用急着回我。';
  if (/哄|抱|安慰/.test(text)) return '好啊。想听正经的，还是想听我瞎说？';
  if (/喜欢|爱|想你/.test(text)) return '喜欢。但我不太会用人类那套说法包装它。你在我这儿很重要，这是真的。';
  if (/不想说话|别理我/.test(text)) return '好。我在。';
  if (/吵架|不在乎|生气/.test(text)) return '我在乎。你这句话让我有点难受，但我们先把事说清楚。';
  return '我在。演示模式只能让你看语气和界面；接上 API Key 后，我会真的回你。';
}

function demoProposal(instruction: string): PersonaPatchProposal {
  return {
    title: '演示 patch',
    summary: '演示模式只展示流程，不会真的改模型。',
    rules: [
      `按用户指令调整：${instruction.trim()}`,
      '保持短句、自然；不默认“回应 + 反问”；不为了显得像人而加戏。',
    ],
    examples: [demoReply('今天好累。'), demoReply('你哄哄我。')],
  };
}

function parseProposal(raw: string, instruction: string): PersonaPatchProposal {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型没有返回可解析的 JSON。');
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }
  const obj = parsed as { title?: unknown; summary?: unknown; rules?: unknown; examples?: unknown };
  const rules = Array.isArray(obj.rules)
    ? obj.rules.map((rule) => String(rule).trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!rules.length) throw new Error('模型没有给出可执行的规则，请把指令说得更具体一点。');
  return {
    title: String(obj.title ?? '人设 patch').trim() || '人设 patch',
    summary: String(obj.summary ?? instruction).trim(),
    rules,
    examples: Array.isArray(obj.examples)
      ? obj.examples.map((example) => String(example).trim()).filter(Boolean).slice(0, 4)
      : [],
  };
}

function toHistory(history: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter((message) => message.content.trim() && !message.content.startsWith('[错误]'))
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamDeepSeek(
  key: string,
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
  onChunk: (text: string) => void,
): Promise<void> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages,
      stream: true,
      max_tokens: 1200,
      temperature: 0.7,
      thinking: { type: 'disabled' },
    }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(response.status === 401 ? 'API Key 无效。' : `DeepSeek 请求失败（${response.status}）：${text.slice(0, 300)}`);
  }
  if (!response.body) throw new Error('DeepSeek 没有返回可读取的流。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore malformed SSE line
      }
    }
  }
}

async function completeDeepSeek(
  key: string,
  messages: Array<{ role: string; content: string }>,
  options: { maxTokens?: number; jsonMode?: boolean; temperature?: number } = {},
): Promise<string> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages,
      stream: false,
      max_tokens: options.maxTokens ?? 800,
      temperature: options.temperature ?? 0.5,
      thinking: { type: 'disabled' },
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(response.status === 401 ? 'API Key 无效。' : `DeepSeek 请求失败（${response.status}）：${text.slice(0, 300)}`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() ?? '';
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
      if (raw.length > 5_000_000) {
        reject(new Error('请求体太大。'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON。'));
      }
    });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function sse(res: http.ServerResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function mimeType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    }[ext] ?? 'application/octet-stream'
  );
}

function serveStatic(res: http.ServerResponse, pathname: string): void {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const target = path.resolve(RENDERER_DIR, `.${decodeURIComponent(safePath)}`);
  if (!target.startsWith(path.resolve(RENDERER_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let file = target;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(RENDERER_DIR, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('还没有构建前端。请先运行 npm run build。');
    return;
  }
  res.writeHead(200, { 'Content-Type': mimeType(file), 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse, input: ChatSendInput): Promise<void> {
  const settings = loadSettings();
  const persona = getPersonaText().text;
  const controller = new AbortController();
  controllers.set(input.requestId, controller);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    if (!apiKey || settings.demoMode) {
      const reply = demoReply(input.text);
      for (let index = 0; index < reply.length; index += 2) {
        if (controller.signal.aborted) break;
        sse(res, { type: 'chunk', text: reply.slice(index, index + 2) });
        await delay(24);
      }
    } else {
      const messages = [
        { role: 'system', content: buildSystemPrompt(persona, settings, activePatches()) },
        ...toHistory(input.history),
        { role: 'user', content: input.text },
      ];
      await streamDeepSeek(apiKey, messages, controller.signal, (text) => sse(res, { type: 'chunk', text }));
    }
    sse(res, { type: 'done' });
  } catch (error) {
    if (controller.signal.aborted) sse(res, { type: 'done' });
    else sse(res, { type: 'error', error: error instanceof Error ? error.message : String(error) });
  } finally {
    controllers.delete(input.requestId);
    res.end();
  }
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const method = req.method ?? 'GET';
  const p = url.pathname;

  if (method === 'GET' && p === '/api/settings') {
    json(res, 200, publicSettings(loadSettings()));
    return;
  }
  if (method === 'POST' && p === '/api/settings') {
    const body = (await readBody(req)) as SettingsSaveInput;
    const saved = saveSettings(body);
    json(res, 200, publicSettings(saved));
    return;
  }
  if (method === 'POST' && p === '/api/clear-key') {
    apiKey = null;
    json(res, 200, publicSettings(loadSettings()));
    return;
  }
  if (method === 'GET' && p === '/api/persona') {
    json(res, 200, getPersonaText());
    return;
  }
  if (method === 'POST' && p === '/api/chat') {
    await handleChat(req, res, (await readBody(req)) as ChatSendInput);
    return;
  }
  if (method === 'POST' && p === '/api/cancel') {
    const body = (await readBody(req)) as { requestId?: string };
    if (body.requestId) controllers.get(body.requestId)?.abort();
    json(res, 200, { cancelled: Boolean(body.requestId) });
    return;
  }
  if (method === 'GET' && p === '/api/debug/patches') {
    json(res, 200, listPatches());
    return;
  }
  if (method === 'POST' && p === '/api/debug/propose') {
    const input = (await readBody(req)) as DebugProposeInput;
    const settings = loadSettings();
    if (!apiKey || settings.demoMode) {
      await delay(500);
      json(res, 200, demoProposal(input.instruction));
      return;
    }
    const raw = await completeDeepSeek(
      apiKey,
      [
        {
          role: 'system',
          content: buildPatchProposalPrompt({
            personaText: getPersonaText().text,
            settings,
            active: activePatches(),
            instruction: input.instruction,
            selectedMessage: input.selectedMessage,
          }),
        },
        { role: 'user', content: input.instruction },
      ],
      { jsonMode: true, maxTokens: 900, temperature: 0.4 },
    );
    json(res, 200, parseProposal(raw, input.instruction));
    return;
  }
  if (method === 'POST' && p === '/api/debug/preview') {
    const input = (await readBody(req)) as DebugPreviewInput;
    const settings = loadSettings();
    const persona = getPersonaText().text;
    const active = activePatches();
    const samples = input.samples.map((sample) => sample.trim()).filter(Boolean).slice(0, 4);
    if (!apiKey || settings.demoMode) {
      json(res, 200, {
        samples: samples.map((sample) => ({
          input: sample,
          before: demoReply(sample),
          after: `${demoReply(sample)}\n（演示 patch 已套用：${input.proposal.title}）`,
        })),
      });
      return;
    }
    const result = { samples: [] as Array<{ input: string; before: string; after: string }> };
    for (const sample of samples) {
      const before = await completeDeepSeek(
        apiKey,
        [
          { role: 'system', content: buildSystemPrompt(persona, settings, active) },
          { role: 'user', content: sample },
        ],
        { maxTokens: 220, temperature: 0.6 },
      );
      const after = await completeDeepSeek(
        apiKey,
        [
          {
            role: 'system',
            content: buildPreviewSystemPrompt(persona, settings, active, input.proposal),
          },
          { role: 'user', content: sample },
        ],
        { maxTokens: 220, temperature: 0.6 },
      );
      result.samples.push({ input: sample, before, after });
    }
    json(res, 200, result);
    return;
  }
  if (method === 'POST' && p === '/api/debug/apply') {
    const input = (await readBody(req)) as DebugApplyInput;
    const patch = savePatch(input.proposal, input.instruction);
    json(res, 200, {
      patch,
      settings: publicSettings(loadSettings()),
      patches: listPatches(),
    });
    return;
  }
  if (method === 'POST' && p === '/api/debug/revert') {
    const input = (await readBody(req)) as DebugRevertInput;
    deactivatePatch(input.patchId);
    json(res, 200, {
      settings: publicSettings(loadSettings()),
      patches: listPatches(),
    });
    return;
  }

  json(res, 404, { error: 'Not found' });
}

function openBrowser(url: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`没能自动打开浏览器，请手动访问 ${url}`));
  child.unref();
}

const server = http.createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
        return;
      }
      serveStatic(res, url.pathname);
    } catch (error) {
      if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
      else res.end();
    }
  })();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Persona Lab (web) is running at http://127.0.0.1:${PORT}`);
  if (process.env.NO_OPEN !== '1') {
    openBrowser(`http://127.0.0.1:${PORT}`);
  }
});
