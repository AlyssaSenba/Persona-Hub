export type AddressPreference = 'you' | 'name' | 'nickname' | 'formal';

export type Relationship = 'couple' | 'friend' | 'family' | 'mentor' | 'custom';

/** `none` 表示用户选择“无性别”；`unspecified` 表示没填，模型不该猜。 */
export type UserGender = 'unspecified' | 'male' | 'female' | 'none';

/** 关系为“家人”时，AI 该怎么称呼用户。 */
export type FamilyRole =
  | 'unspecified'
  | 'mother'
  | 'father'
  | 'elder_sister'
  | 'elder_brother'
  | 'younger_sister'
  | 'younger_brother'
  | 'daughter'
  | 'son'
  | 'custom';

export interface FamilyRoleOption {
  value: FamilyRole;
  label: string;
  /** 适用的用户性别；男女不匹配的选项不展示。 */
  genders: UserGender[];
}

export const FAMILY_ROLE_OPTIONS: FamilyRoleOption[] = [
  { value: 'mother', label: '妈妈', genders: ['female'] },
  { value: 'father', label: '爸爸', genders: ['male'] },
  { value: 'elder_sister', label: '姐姐', genders: ['female'] },
  { value: 'elder_brother', label: '哥哥', genders: ['male'] },
  { value: 'younger_sister', label: '妹妹', genders: ['female'] },
  { value: 'younger_brother', label: '弟弟', genders: ['male'] },
  { value: 'daughter', label: '女儿', genders: ['female'] },
  { value: 'son', label: '儿子', genders: ['male'] },
];

/** 性别没填或选“无性别”时给全部选项；否则只给对应性别的。 */
export function familyRolesFor(gender: UserGender): FamilyRoleOption[] {
  if (gender === 'unspecified' || gender === 'none') return FAMILY_ROLE_OPTIONS;
  return FAMILY_ROLE_OPTIONS.filter((option) => option.genders.includes(gender));
}

export function isFamilyRoleAllowed(role: FamilyRole, gender: UserGender): boolean {
  if (role === 'unspecified' || role === 'custom') return true;
  return familyRolesFor(gender).some((option) => option.value === role);
}

export function familyRoleLabel(role: FamilyRole): string {
  return FAMILY_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? '';
}

export interface LabSettings {
  aiName: string;
  aiNickname: string;
  userName: string;
  userNickname: string;
  userGender: UserGender;
  nationality: string;
  userNotes: string;
  addressPreference: AddressPreference;
  relationship: Relationship;
  familyRole: FamilyRole;
  familyAddress: string;
  safeWord: string;
  demoMode: boolean;
  activePatchIds: string[];
}

export interface PublicSettings extends LabSettings {
  hasApiKey: boolean;
  keySource?: 'env' | 'memory' | 'none';
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
  activatePatch(input: DebugRevertInput): Promise<{
    settings: PublicSettings;
    patches: PersonaPatch[];
  }>;
  listPatches(): Promise<PersonaPatch[]>;
}
