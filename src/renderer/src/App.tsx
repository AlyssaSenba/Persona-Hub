import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  ChatMessage,
  LabSettings,
  PersonaPatch,
  PersonaPatchProposal,
  PreviewResult,
  PublicSettings,
} from '@shared/types';
import { SettingsModal } from './components/SettingsModal';
import { DebugModal } from './components/DebugModal';

const DEFAULT_FORM: LabSettings = {
  aiName: '伙伴',
  aiNickname: '',
  userName: '',
  userNickname: '',
  userGender: 'unspecified',
  nationality: '',
  userNotes: '',
  addressPreference: 'you',
  relationship: 'couple',
  familyRole: 'unspecified',
  familyAddress: '',
  safeWord: '',
  demoMode: true,
  activePatchIds: [],
};

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [form, setForm] = useState<LabSettings>(DEFAULT_FORM);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [patches, setPatches] = useState<PersonaPatch[]>([]);
  const [personaPath, setPersonaPath] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<PersonaPatchProposal | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [samples, setSamples] = useState('今天好累。\n你哄哄我。\n你根本不在乎我。');
  const [busy, setBusy] = useState<'propose' | 'preview' | ''>('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);

  const requestRef = useRef<string | null>(null);
  const assistantRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([window.lab.getSettings(), window.lab.listPatches(), window.lab.getPersona()])
      .then(([nextSettings, nextPatches, persona]) => {
        if (!mounted) return;
        setSettings(nextSettings);
        setForm({ ...nextSettings });
        setPatches(nextPatches);
        setPersonaPath(persona.path);
        setReady(true);
      })
      .catch((reason: unknown) => {
        if (!mounted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  useEffect(() => {
    const unsubscribe = window.lab.onChatEvent((event) => {
      if (event.requestId !== requestRef.current) return;
      if (event.type === 'chunk') {
        const assistantId = assistantRef.current;
        if (!assistantId) return;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + event.text } : message,
          ),
        );
      }
      if (event.type === 'done') {
        setStreaming(false);
        requestRef.current = null;
        assistantRef.current = null;
      }
      if (event.type === 'error') {
        const assistantId = assistantRef.current;
        if (assistantId) {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, content: `[错误] ${event.error}` }
                : message,
            ),
          );
        }
        setError(event.error);
        setStreaming(false);
        requestRef.current = null;
        assistantRef.current = null;
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedMessage = messages.find((message) => message.id === selectedId) ?? null;

  function openDebug(): void {
    setDebugOpen(true);
    if (!selectedId) {
      const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
      if (lastAssistant) setSelectedId(lastAssistant.id);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        openDebug();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function startRequest(text: string, history: ChatMessage[]): Promise<void> {
    const requestId = uid();
    const assistantId = uid();
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: uid(), role: 'user', content: text, createdAt: now };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: now,
    };

    requestRef.current = requestId;
    assistantRef.current = assistantId;
    setMessages([...history, userMessage, assistantMessage]);
    setStreaming(true);
    setError('');

    try {
      const result = await window.lab.sendChat({ requestId, text, history });
      if (!result.started) {
        setStreaming(false);
        requestRef.current = null;
        assistantRef.current = null;
        setError('消息没有发出去，请稍后再试。');
      }
    } catch (reason) {
      setStreaming(false);
      requestRef.current = null;
      assistantRef.current = null;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || streaming) return;

    if (settings?.safeWord && text === settings.safeWord) {
      setInput('');
      openDebug();
      setNotice('已打开调试模式；安全词没有发送给模型。');
      return;
    }

    setInput('');
    await startRequest(text, messages);
  }

  async function stop(): Promise<void> {
    const requestId = requestRef.current;
    if (requestId) await window.lab.cancelChat(requestId);
    setStreaming(false);
    requestRef.current = null;
    assistantRef.current = null;
  }

  async function regenerate(): Promise<void> {
    if (streaming) return;
    const index = [...messages].map((message) => message.role).lastIndexOf('user');
    if (index < 0) return;
    const lastUser = messages[index];
    await startRequest(lastUser.content, messages.slice(0, index));
  }

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function saveSettings(): Promise<void> {
    if (!form.aiName.trim()) {
      setError('先给 AI 起一个名字。');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await window.lab.saveSettings({
        ...form,
        apiKey: apiKeyInput.trim() || undefined,
      });
      setSettings(saved);
      setApiKeyInput('');
      setSettingsOpen(false);
      setNotice('设置已保存。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function clearKey(): Promise<void> {
    setSaving(true);
    try {
      const saved = await window.lab.clearApiKey();
      setSettings(saved);
      setNotice('API Key 已清除。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  async function proposePatch(): Promise<void> {
    if (!instruction.trim()) {
      setError('先写一句你想改什么。');
      return;
    }
    setBusy('propose');
    setError('');
    setPreview(null);
    try {
      const next = await window.lab.proposePatch({
        instruction: instruction.trim(),
        selectedMessage: selectedMessage?.content,
      });
      setProposal(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy('');
    }
  }

  async function previewPatch(): Promise<void> {
    if (!proposal) return;
    setBusy('preview');
    setError('');
    try {
      const result = await window.lab.previewPatch({
        proposal,
        samples: samples.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      });
      setPreview(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy('');
    }
  }

  async function applyPatch(): Promise<void> {
    if (!proposal) return;
    setBusy('propose');
    setError('');
    try {
      const result = await window.lab.applyPatch({
        proposal,
        instruction: instruction.trim(),
      });
      setPatches(result.patches);
      setSettings(result.settings);
      setProposal(null);
      setPreview(null);
      setNotice('人设 patch 已应用；下一轮生效。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy('');
    }
  }

  async function revertPatch(patchId: string): Promise<void> {
    setError('');
    try {
      const result = await window.lab.revertPatch({ patchId });
      setPatches(result.patches);
      setSettings(result.settings);
      setNotice('已停用这个 patch，文件还在，可以重新启用。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function activatePatch(patchId: string): Promise<void> {
    setError('');
    try {
      const result = await window.lab.activatePatch({ patchId });
      setPatches(result.patches);
      setSettings(result.settings);
      setNotice('已重新启用，下一轮生效。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  if (!ready) {
    return (
      <div className="loading">
        <div className="loading-mark">…</div>
        <p>正在加载 Persona Lab</p>
      </div>
    );
  }

  const activePatches = patches.filter((patch) => patch.active);
  const modeLabel = settings?.demoMode || !settings?.hasApiKey ? '演示模式' : '真实模型';

  return (
    <div className="app">
      <aside className="sidebar">
        <div>
          <div className="brand">Persona Lab</div>
          <div className="brand-sub">只调人设，不含完整 app</div>
        </div>

        <div className="persona-card">
          <div className="persona-name">{settings?.aiName || '未命名'}</div>
          <div className="persona-meta">
            {settings?.relationship === 'couple'
              ? '情侣'
              : settings?.relationship === 'friend'
                ? '朋友'
                : settings?.relationship === 'family'
                  ? '家人'
                  : settings?.relationship === 'mentor'
                    ? '导师'
                    : '自定义'}
            {' · '}
            {modeLabel}
          </div>
          <div className="persona-hint">
            {settings?.safeWord ? `安全词：${settings.safeWord}` : '安全词：未设置'}
          </div>
        </div>

        <nav className="side-actions">
          <button type="button" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
          <button type="button" onClick={openDebug}>
            调试人设
          </button>
        </nav>

        <div className="side-section">
          <div className="side-label">生效中的 patch</div>
          {activePatches.length === 0 ? (
            <p className="side-empty">还没有。打开调试，输入一句“别老反问”。</p>
          ) : (
            activePatches.map((patch) => (
              <div className="side-patch" key={patch.id}>
                <span>{patch.title}</span>
                <button type="button" onClick={() => void revertPatch(patch.id)}>
                  回滚
                </button>
              </div>
            ))
          )}
        </div>

        <div className="side-foot">
          <p>Ctrl + Shift + D 打开调试</p>
          <p>{personaPath ? personaPath.split(/[\\/]/).pop() : 'persona.md'}</p>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{settings?.aiName || '未命名'} · 对话</h1>
            <p>这是调试版。没有记忆、日程、专注；只用来调语气和人设。</p>
          </div>
          <div className="topbar-right">
            <span className={`status ${modeLabel === '演示模式' ? 'demo' : 'live'}`}>{modeLabel}</span>
            <button type="button" className="ghost" onClick={openDebug}>
              调试
            </button>
          </div>
        </header>

        <section className="chat" aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty">
              <div className="empty-title">先聊一句</div>
              <p>试试“今天好累”，或者“你哄哄我”。觉得哪句不对，点它，按 Ctrl+Shift+D 调。</p>
              <p className="empty-note">
                {settings?.safeWord
                  ? `也可以输入安全词“${settings.safeWord}”打开调试。`
                  : '在设置里给自己定一个安全词，之后输入它就能打开调试。'}
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.role} ${selectedId === message.id ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(message.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(message.id);
                  }
                }}
              >
                <div className="message-meta">
                  <span>{message.role === 'user' ? '你' : settings?.aiName || '他'}</span>
                  <span>{timeLabel(message.createdAt)}</span>
                </div>
                <div className="message-body">
                  {message.content || (message.role === 'assistant' ? '…' : '')}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </section>

        <footer className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder="说点什么。Enter 发送，Shift+Enter 换行。"
            rows={3}
            disabled={streaming}
          />
          <div className="composer-actions">
            <div className="composer-hint">
              {settings?.safeWord ? `安全词：${settings.safeWord}` : '安全词未设置'}
              {' · '}
              {modeLabel}
            </div>
            <div className="composer-buttons">
              {streaming ? (
                <button type="button" className="danger" onClick={() => void stop()}>
                  停止
                </button>
              ) : (
                <>
                  <button type="button" className="ghost" onClick={() => void regenerate()}>
                    重生成
                  </button>
                  <button type="button" className="primary" onClick={() => void send()}>
                    发送
                  </button>
                </>
              )}
            </div>
          </div>
          {error ? <div className="inline-error">{error}</div> : null}
        </footer>
      </main>

      {settingsOpen && settings ? (
        <SettingsModal
          settings={settings}
          form={form}
          apiKeyInput={apiKeyInput}
          saving={saving}
          personaPath={personaPath}
          patches={patches}
          onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onApiKeyChange={setApiKeyInput}
          onSave={() => void saveSettings()}
          onClearKey={() => void clearKey()}
          onRevert={(patchId) => void revertPatch(patchId)}
          onActivate={(patchId) => void activatePatch(patchId)}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {debugOpen ? (
        <DebugModal
          selectedMessage={selectedMessage}
          instruction={instruction}
          onInstructionChange={setInstruction}
          samples={samples}
          onSamplesChange={setSamples}
          proposal={proposal}
          preview={preview}
          patches={patches}
          busy={busy}
          onPropose={() => void proposePatch()}
          onPreview={() => void previewPatch()}
          onApply={() => void applyPatch()}
          onRevert={(patchId) => void revertPatch(patchId)}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}

      {notice ? <div className="toast">{notice}</div> : null}
    </div>
  );
}
