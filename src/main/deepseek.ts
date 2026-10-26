const BASE_URL = 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  apiKey: string;
  messages: DeepSeekMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

function makeController(signal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  return {
    controller,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

function errorMessage(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 600);
  if (status === 401) return 'API Key 无效或已撤销。请到设置里重新填写。';
  if (status === 402) return '账户余额不足。请到 DeepSeek 平台充值。';
  if (status === 429) return '请求太频繁，稍后再试。';
  return `DeepSeek 请求失败（HTTP ${status}）：${trimmed || '无返回内容'}`;
}

export async function streamChat(
  options: ChatOptions & { onChunk: (text: string) => void },
): Promise<string> {
  const { controller, cleanup } = makeController(options.signal);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: options.messages,
        stream: true,
        max_tokens: options.maxTokens ?? 1200,
        temperature: options.temperature ?? 0.7,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(errorMessage(response.status, await response.text()));
    }
    if (!response.body) {
      throw new Error('DeepSeek 没有返回可读取的流。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

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
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            options.onChunk(delta);
          }
        } catch {
          // Ignore malformed SSE lines; the next chunk may be fine.
        }
      }
    }

    return full;
  } finally {
    cleanup();
  }
}

export async function completeChat(
  options: ChatOptions & { jsonMode?: boolean },
): Promise<string> {
  const { controller, cleanup } = makeController(options.signal);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: options.messages,
        stream: false,
        max_tokens: options.maxTokens ?? 800,
        temperature: options.temperature ?? 0.5,
        thinking: { type: 'disabled' },
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(errorMessage(response.status, await response.text()));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  } finally {
    cleanup();
  }
}
