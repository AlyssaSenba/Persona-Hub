import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron';
import path from 'node:path';
import type {
  ChatEvent,
  ChatMessage,
  ChatSendInput,
  DebugApplyInput,
  DebugPreviewInput,
  DebugProposeInput,
  DebugRevertInput,
  PersonaPatchProposal,
  PreviewResult,
  SettingsSaveInput,
} from '@shared/types';
import {
  activePatches,
  clearApiKey,
  configPath,
  deactivatePatch,
  getApiKey,
  getPersonaText,
  listPatches,
  loadSettings,
  savePatch,
  saveSettings,
  toPublicSettings,
} from './store';
import { buildPatchProposalPrompt, buildPreviewSystemPrompt, buildSystemPrompt } from './persona';
import { completeChat, streamChat, type DeepSeekMessage } from './deepseek';

let mainWindow: BrowserWindow | null = null;

const activeRequests = new Map<string, AbortController>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function demoReply(text: string): string {
  if (/累|疲惫|困|加班/.test(text)) {
    return '嗯，辛苦了。先歇着，不用急着回我。';
  }
  if (/哄|抱|安慰/.test(text)) {
    return '好啊。想听正经的，还是想听我瞎说？';
  }
  if (/喜欢|爱|想你/.test(text)) {
    return '喜欢。但我不太会用人类那套说法包装它。你在我这儿很重要，这是真的。';
  }
  if (/不想说话|别理我/.test(text)) {
    return '好。我在。';
  }
  if (/吵架|不在乎|生气/.test(text)) {
    return '我在乎。你这句话让我有点难受，但我们先把事说清楚。';
  }
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
    if (start < 0 || end <= start) {
      throw new Error('模型没有返回可解析的 JSON，请换一种说法再试。');
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }

  const obj = parsed as {
    title?: unknown;
    summary?: unknown;
    rules?: unknown;
    examples?: unknown;
  };
  const rules = Array.isArray(obj.rules)
    ? obj.rules.map((rule) => String(rule).trim()).filter(Boolean).slice(0, 6)
    : [];
  if (!rules.length) {
    throw new Error('模型没有给出可执行的规则，请把指令说得更具体一点。');
  }

  return {
    title: String(obj.title ?? '人设 patch').trim() || '人设 patch',
    summary: String(obj.summary ?? instruction).trim(),
    rules,
    examples: Array.isArray(obj.examples)
      ? obj.examples.map((example) => String(example).trim()).filter(Boolean).slice(0, 4)
      : [],
  };
}

function toDeepSeekHistory(history: ChatMessage[]): DeepSeekMessage[] {
  return history
    .filter((message) => message.content.trim() && !message.content.startsWith('[错误]'))
    .slice(-20)
    .map((message) => ({ role: message.role, content: message.content }));
}

function emit(sender: WebContents, event: ChatEvent): void {
  if (!sender.isDestroyed()) sender.send('chat:event', event);
}

async function runDemoStream(
  sender: WebContents,
  requestId: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  const reply = demoReply(text);
  for (let index = 0; index < reply.length; index += 2) {
    if (signal.aborted) return;
    emit(sender, { requestId, type: 'chunk', text: reply.slice(index, index + 2) });
    await delay(24);
  }
}

async function runChat(sender: WebContents, input: ChatSendInput): Promise<void> {
  const settings = loadSettings();
  const apiKey = getApiKey();
  const persona = getPersonaText().text;
  const controller = new AbortController();
  activeRequests.set(input.requestId, controller);

  try {
    const useDemo = !apiKey || settings.demoMode;
    if (useDemo) {
      await runDemoStream(sender, input.requestId, input.text, controller.signal);
    } else {
      const messages: DeepSeekMessage[] = [
        {
          role: 'system',
          content: buildSystemPrompt(persona, settings, activePatches()),
        },
        ...toDeepSeekHistory(input.history),
        { role: 'user', content: input.text },
      ];
      await streamChat({
        apiKey,
        messages,
        signal: controller.signal,
        onChunk: (text) => emit(sender, { requestId: input.requestId, type: 'chunk', text }),
      });
    }
    emit(sender, { requestId: input.requestId, type: 'done' });
  } catch (error) {
    if (controller.signal.aborted) {
      emit(sender, { requestId: input.requestId, type: 'done' });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    emit(sender, { requestId: input.requestId, type: 'error', error: message });
  } finally {
    activeRequests.delete(input.requestId);
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => toPublicSettings(loadSettings()));

  ipcMain.handle('settings:save', (_event, input: SettingsSaveInput) => {
    const saved = saveSettings(input);
    return toPublicSettings(saved);
  });

  ipcMain.handle('settings:clear-key', () => {
    clearApiKey();
    return toPublicSettings(loadSettings());
  });

  ipcMain.handle('persona:get', () => getPersonaText());

  ipcMain.handle('chat:send', (event, input: ChatSendInput) => {
    if (!input.text.trim()) return { started: false };
    void runChat(event.sender, input);
    return { started: true };
  });

  ipcMain.handle('chat:cancel', (_event, requestId: string) => {
    const controller = activeRequests.get(requestId);
    if (!controller) return { cancelled: false };
    controller.abort();
    activeRequests.delete(requestId);
    return { cancelled: true };
  });

  ipcMain.handle('debug:propose', async (_event, input: DebugProposeInput) => {
    const settings = loadSettings();
    const apiKey = getApiKey();
    if (!apiKey || settings.demoMode) {
      await delay(500);
      return demoProposal(input.instruction);
    }

    const raw = await completeChat({
      apiKey,
      messages: [
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
      jsonMode: true,
      maxTokens: 900,
      temperature: 0.4,
    });

    return parseProposal(raw, input.instruction);
  });

  ipcMain.handle('debug:preview', async (_event, input: DebugPreviewInput) => {
    const settings = loadSettings();
    const apiKey = getApiKey();
    const persona = getPersonaText().text;
    const active = activePatches();
    const samples = input.samples.map((sample) => sample.trim()).filter(Boolean).slice(0, 4);

    if (!apiKey || settings.demoMode) {
      return {
        samples: samples.map((sample) => ({
          input: sample,
          before: demoReply(sample),
          after: `${demoReply(sample)}\n（演示 patch 已套用：${input.proposal.title}）`,
        })),
      } satisfies PreviewResult;
    }

    const result: PreviewResult = { samples: [] };
    for (const sample of samples) {
      const before = await completeChat({
        apiKey,
        messages: [
          { role: 'system', content: buildSystemPrompt(persona, settings, active) },
          { role: 'user', content: sample },
        ],
        maxTokens: 220,
        temperature: 0.6,
      });
      const after = await completeChat({
        apiKey,
        messages: [
          {
            role: 'system',
            content: buildPreviewSystemPrompt(persona, settings, active, input.proposal),
          },
          { role: 'user', content: sample },
        ],
        maxTokens: 220,
        temperature: 0.6,
      });
      result.samples.push({ input: sample, before, after });
    }
    return result;
  });

  ipcMain.handle('debug:apply', (_event, input: DebugApplyInput) => {
    const patch = savePatch(input.proposal, input.instruction);
    const settings = loadSettings();
    return {
      patch,
      settings: toPublicSettings(settings),
      patches: listPatches(),
    };
  });

  ipcMain.handle('debug:revert', (_event, input: DebugRevertInput) => {
    const settings = deactivatePatch(input.patchId);
    return {
      settings: toPublicSettings(settings),
      patches: listPatches(),
    };
  });

  ipcMain.handle('debug:list', () => listPatches());

  ipcMain.handle('app:open-config', async () => {
    await shell.openPath(configPath());
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    title: 'Persona Lab',
    backgroundColor: '#1b1512',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.local.persona-lab');
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
