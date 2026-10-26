import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  LabSettings,
  PersonaPatch,
  PersonaPatchProposal,
  PublicSettings,
  SettingsSaveInput,
} from '@shared/types';

const WORKSPACE_ROOT = process.cwd();
const CONFIG_DIR = path.join(WORKSPACE_ROOT, 'config');
const PATCH_DIR = path.join(CONFIG_DIR, 'persona-patches');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'lab-settings.json');
const SECRETS_FILE = path.join(CONFIG_DIR, 'lab-secrets.json');
const PERSONA_FILE = path.join(WORKSPACE_ROOT, 'persona.md');

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

function ensureDirs(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(PATCH_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown): void {
  ensureDirs();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function loadSettings(): LabSettings {
  ensureDirs();
  const raw = readJson<Partial<LabSettings>>(SETTINGS_FILE, {});
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    activePatchIds: Array.isArray(raw.activePatchIds) ? raw.activePatchIds : [],
  };
}

export function saveSettings(input: SettingsSaveInput): LabSettings {
  ensureDirs();
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
    saveApiKey(input.apiKey);
  }

  writeJson(SETTINGS_FILE, next);
  return next;
}

export function saveApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用，无法安全保存 API Key。请先使用演示模式，或检查系统凭据服务。');
  }
  const encrypted = safeStorage.encryptString(key.trim()).toString('base64');
  writeJson(SECRETS_FILE, { apiKeyEnc: encrypted });
}

export function getApiKey(): string | null {
  const raw = readJson<{ apiKeyEnc?: string }>(SECRETS_FILE, {});
  if (!raw.apiKeyEnc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(raw.apiKeyEnc, 'base64'));
  } catch {
    return null;
  }
}

export function clearApiKey(): void {
  try {
    if (fs.existsSync(SECRETS_FILE)) fs.unlinkSync(SECRETS_FILE);
  } catch {
    // ignore
  }
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

export function toPublicSettings(settings: LabSettings): PublicSettings {
  return { ...settings, hasApiKey: hasApiKey() };
}

export function getPersonaText(): { text: string; path: string } {
  try {
    return { text: fs.readFileSync(PERSONA_FILE, 'utf8'), path: PERSONA_FILE };
  } catch {
    return {
      path: PERSONA_FILE,
      text:
        '# persona.md\n\n（未找到 persona.md。请把 persona.md 放在项目根目录，或使用默认人设。）\n',
    };
  }
}

function patchFile(id: string): string {
  return path.join(PATCH_DIR, `${id}.json`);
}

export function listPatches(): PersonaPatch[] {
  ensureDirs();
  const settings = loadSettings();
  const active = new Set(settings.activePatchIds);
  const files = fs.existsSync(PATCH_DIR)
    ? fs.readdirSync(PATCH_DIR).filter((name) => name.endsWith('.json'))
    : [];

  return files
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

export function activePatches(): PersonaPatch[] {
  return listPatches().filter((patch) => patch.active);
}

export function savePatch(proposal: PersonaPatchProposal, instruction: string): PersonaPatch {
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
  if (!settings.activePatchIds.includes(patch.id)) {
    settings.activePatchIds.push(patch.id);
  }
  writeJson(SETTINGS_FILE, settings);
  return patch;
}

export function deactivatePatch(patchId: string): LabSettings {
  const settings = loadSettings();
  settings.activePatchIds = settings.activePatchIds.filter((id) => id !== patchId);
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

export function configPath(): string {
  ensureDirs();
  return CONFIG_DIR;
}

export function appVersion(): string {
  return app.getVersion();
}
