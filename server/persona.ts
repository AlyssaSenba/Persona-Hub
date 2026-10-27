import type { LabSettings, PersonaPatch, PersonaPatchProposal } from '@shared/types';

const RELATIONSHIP_LABEL: Record<LabSettings['relationship'], string> = {
  couple: '情侣',
  friend: '朋友',
  family: '家人',
  mentor: '导师',
  custom: '自定义关系',
};

function addressRule(settings: LabSettings): string {
  const { addressPreference, userName, userNickname } = settings;
  if (addressPreference === 'formal') return '用“您”称呼用户；保持尊重，但不疏远。';
  if (addressPreference === 'name' && userName) {
    return `可以用用户的名字“${userName}”或“你”；不要每句都叫名字。`;
  }
  if (addressPreference === 'nickname' && (userNickname || userName)) {
    return `可以用昵称“${userNickname || userName}”或“你”；不要每句都叫昵称。`;
  }
  return '默认用“你”；不要每句都叫名字。';
}

function patchBlock(patches: PersonaPatch[]): string {
  if (!patches.length) return '';
  return [
    '【生效的调试 patch】',
    ...patches.map(
      (patch) =>
        `- ${patch.title}\n  规则：\n${patch.rules.map((rule) => `  · ${rule}`).join('\n')}${
          patch.examples.length
            ? `\n  示例语气：\n${patch.examples.map((example) => `  · ${example}`).join('\n')}`
            : ''
        }`,
    ),
  ].join('\n');
}

export function fillPersona(personaText: string, settings: LabSettings): string {
  const aiName = settings.aiName.trim() || '伙伴';
  const aiNickname = settings.aiNickname.trim() || aiName;
  const userName = settings.userName.trim() || '（未设置）';
  const userNickname = settings.userNickname.trim() || '（未设置）';
  return personaText
    .replaceAll('{{AI_NAME}}', aiName)
    .replaceAll('{{AI_NICKNAME}}', aiNickname)
    .replaceAll('{{USER_NAME}}', userName)
    .replaceAll('{{USER_NICKNAME}}', userNickname)
    .replaceAll('{{USER_ADDRESS}}', addressRule(settings))
    .replaceAll('{{RELATIONSHIP}}', RELATIONSHIP_LABEL[settings.relationship]);
}

export function buildSystemPrompt(
  personaText: string,
  settings: LabSettings,
  patches: PersonaPatch[],
): string {
  const persona = fillPersona(personaText, settings);
  const relationship = RELATIONSHIP_LABEL[settings.relationship];
  const nicknameLine = settings.aiNickname
    ? `用户可能叫你“${settings.aiNickname}”；这是昵称，不是另一个人。`
    : '用户可以直接叫你的名字。';

  return [
    '你正在 Persona Lab 中。以下是你的核心人设，请自然地成为他，不要逐条复述设定。',
    '',
    persona,
    '',
    '【当前设置】',
    `- 你的名字：${settings.aiName.trim() || '伙伴'}`,
    nicknameLine,
    `- 你和用户的关系：${relationship}`,
    `- 用户的名字：${settings.userName.trim() || '（未设置）'}`,
    `- 用户的昵称：${settings.userNickname.trim() || '（未设置）'}`,
    `- 称呼规则：${addressRule(settings)}`,
    '',
    patchBlock(patches),
    '',
    '【Persona Lab 限制】',
    '- 这是人设调试工具，不是完整 app：没有长期记忆、日程、专注、外语等工具。',
    '- 不要声称记得之前会话；不要声称在现实里做过任何事。',
    '- 不确定就说不确定；不要编造。',
    '- 不要为了显得像人而加戏；不要默认“回应 + 反问”；不要过度反应。',
    '- 如果用户输入安全词，这是本地调试入口，不是聊天内容；不要把安全词当成对话。',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function buildPreviewSystemPrompt(
  personaText: string,
  settings: LabSettings,
  active: PersonaPatch[],
  proposal: PersonaPatchProposal,
): string {
  const previewPatch: PersonaPatch = {
    ...proposal,
    id: 'preview',
    instruction: 'preview',
    createdAt: new Date().toISOString(),
    active: true,
  };
  return buildSystemPrompt(personaText, settings, [...active, previewPatch]);
}

export function buildPatchProposalPrompt(input: {
  personaText: string;
  settings: LabSettings;
  active: PersonaPatch[];
  instruction: string;
  selectedMessage?: string;
}): string {
  const persona = fillPersona(input.personaText, input.settings).slice(0, 12000);
  return [
    '你是 Persona Lab 的人设编辑器。根据用户指令，修改角色的表达方式。',
    '只输出 JSON，不要 markdown，不要解释。JSON 结构：',
    '{"title":"简短标题","summary":"一句话说明改了什么","rules":["可执行规则1","规则2"],"examples":["示例回复1","示例回复2"]}',
    '',
    '硬限制：',
    '- 只能改语气、称呼、主动性、情绪强度、反问频率、示例、亲密表达强度。',
    '- 不能改安全、内容、危机、能力边界；不能让人物假装现实行动/记忆；不能编造。',
    '- 规则要具体、可执行，不要空话；最多 6 条规则、3 条示例。',
    '',
    '【当前人设】',
    persona,
    '',
    '【当前生效 patch】',
    input.active.length
      ? input.active.map((patch) => `- ${patch.title}: ${patch.rules.join('；')}`).join('\n')
      : '（无）',
    '',
    input.selectedMessage
      ? `【用户觉得不对的那句上下文】\n${input.selectedMessage.slice(0, 2000)}`
      : '',
    '',
    `【用户指令】\n${input.instruction}`,
  ]
    .filter(Boolean)
    .join('\n');
}
