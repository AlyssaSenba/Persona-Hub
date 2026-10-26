import type {
  ChatEvent,
  DebugApplyInput,
  DebugPreviewInput,
  DebugProposeInput,
  DebugRevertInput,
  LabApi,
  PersonaPatch,
  PersonaPatchProposal,
  PreviewResult,
  PublicSettings,
  SettingsSaveInput,
} from '@shared/types';

const listeners = new Set<(event: ChatEvent) => void>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `请求失败（HTTP ${response.status}）`);
  }
  return (await response.json()) as T;
}

function emit(event: ChatEvent): void {
  for (const listener of listeners) listener(event);
}

export function createWebLab(): LabApi {
  return {
    getSettings: () => request<PublicSettings>('/api/settings'),
    saveSettings: (input: SettingsSaveInput) =>
      request<PublicSettings>('/api/settings', { method: 'POST', body: JSON.stringify(input) }),
    clearApiKey: () => request<PublicSettings>('/api/clear-key', { method: 'POST' }),
    getPersona: () => request<{ text: string; path: string }>('/api/persona'),

    sendChat: async (input) => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || '聊天请求失败。');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      void (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() ?? '';
            for (const part of parts) {
              const line = part
                .split(/\r?\n/)
                .find((item) => item.startsWith('data: '));
              if (!line) continue;
              try {
                const event = JSON.parse(line.slice(6)) as Omit<ChatEvent, 'requestId'>;
                emit({ ...event, requestId: input.requestId } as ChatEvent);
              } catch {
                // ignore malformed event
              }
            }
          }
          emit({ requestId: input.requestId, type: 'done' });
        } catch (error) {
          emit({
            requestId: input.requestId,
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();

      return { started: true };
    },

    cancelChat: async (requestId: string) => {
      await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      return { cancelled: true };
    },

    onChatEvent: (callback: (event: ChatEvent) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    proposePatch: (input: DebugProposeInput) =>
      request<PersonaPatchProposal>('/api/debug/propose', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    previewPatch: (input: DebugPreviewInput) =>
      request<PreviewResult>('/api/debug/preview', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    applyPatch: (input: DebugApplyInput) =>
      request<{ patch: PersonaPatch; settings: PublicSettings; patches: PersonaPatch[] }>(
        '/api/debug/apply',
        { method: 'POST', body: JSON.stringify(input) },
      ),

    revertPatch: (input: DebugRevertInput) =>
      request<{ settings: PublicSettings; patches: PersonaPatch[] }>('/api/debug/revert', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    listPatches: () => request<PersonaPatch[]>('/api/debug/patches'),

    openConfig: async () => {
      window.alert('浏览器版无法打开文件夹；配置文件在项目的 config/ 目录。');
    },
  };
}
