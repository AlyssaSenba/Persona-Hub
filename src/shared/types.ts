export type AddressPreference = 'you' | 'name' | 'nickname' | 'formal';

export type Relationship = 'couple' | 'friend' | 'family' | 'mentor' | 'custom';

export interface LabSettings {
  aiName: string;
  aiNickname: string;
  userName: string;
  userNickname: string;
  addressPreference: AddressPreference;
  relationship: Relationship;
  safeWord: string;
  demoMode: boolean;
  activePatchIds: string[];
}

export interface PublicSettings extends LabSettings {
  hasApiKey: boolean;
}

export interface SettingsSaveInput extends LabSettings {
  apiKey?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatSendInput {
  requestId: string;
  text: string;
  history: ChatMessage[];
}

export type ChatEvent =
  | { requestId: string; type: 'chunk'; text: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; error: string };

export interface PersonaPatchProposal {
  title: string;
  summary: string;
  rules: string[];
  examples: string[];
}

export interface PersonaPatch extends PersonaPatchProposal {
  id: string;
  instruction: string;
  createdAt: string;
  active: boolean;
}

export interface PreviewSample {
  input: string;
  before: string;
  after: string;
}

export interface PreviewResult {
  samples: PreviewSample[];
}

export interface DebugProposeInput {
  instruction: string;
  selectedMessage?: string;
}

export interface DebugPreviewInput {
  proposal: PersonaPatchProposal;
  samples: string[];
}

export interface DebugApplyInput {
  proposal: PersonaPatchProposal;
  instruction: string;
}

export interface DebugRevertInput {
  patchId: string;
}

export interface LabApi {
  getSettings(): Promise<PublicSettings>;
  saveSettings(input: SettingsSaveInput): Promise<PublicSettings>;
  clearApiKey(): Promise<PublicSettings>;
  getPersona(): Promise<{ text: string; path: string }>;
  sendChat(input: ChatSendInput): Promise<{ started: boolean }>;
  cancelChat(requestId: string): Promise<{ cancelled: boolean }>;
  onChatEvent(callback: (event: ChatEvent) => void): () => void;
  proposePatch(input: DebugProposeInput): Promise<PersonaPatchProposal>;
  previewPatch(input: DebugPreviewInput): Promise<PreviewResult>;
  applyPatch(input: DebugApplyInput): Promise<{
    patch: PersonaPatch;
    settings: PublicSettings;
    patches: PersonaPatch[];
  }>;
  revertPatch(input: DebugRevertInput): Promise<{
    settings: PublicSettings;
    patches: PersonaPatch[];
  }>;
  listPatches(): Promise<PersonaPatch[]>;
}
