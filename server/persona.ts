import {
  familyRoleLabel,
  type LabSettings,
  type PersonaPatch,
  type PersonaPatchProposal,
} from '../src/shared/types.ts';

const RELATIONSHIP_LABEL: Record<LabSettings['relationship'], string> = {
  couple: '情侣',
  friend: '朋友',
  family: '家人',
  mentor: '导师',
  custom: '自定义关系',
};

const GENDER_LABEL: Record<LabSettings['userGender'], string> = {
  unspecified: '',
  male: '男',
  female: '女',
  none: '无性别',
};

/** 关系为家人时，AI 对用户的称呼；没设置就是空字符串。 */
function familyCall(settings: LabSettings): string {
  if (settings.relationship !== 'family') return '';
  if (settings.familyRole === 'custom') return settings.familyAddress.trim();
  return familyRoleLabel(settings.familyRole);
}

function profileLines(settings: LabSettings): string[] {
  const lines: string[] = [];
  if (settings.nationality.trim()) {
    lines.push(`- 用户的国籍/所在地：${settings.nationality.trim()}（只作背景，不主动追问）`);
  }
  if (settings.userGender !== 'unspecified') {
    lines.push(`- 用户的性别：${GENDER_LABEL[settings.userGender]}（按这个理解称呼和分寸，不拿来开玩笑）`);
  }
  if (settings.userNotes.trim()) {
    lines.push(`- 用户希望你注意的事：${settings.userNotes.trim()}`);
  }
  return lines;
}

/** 只给表格/占位用的短标签（“你 / 名字 / 姐姐”），完整规则由 addressRule 给。 */
function addressLabel(settings: LabSettings): string {
  const family = familyCall(settings);
  if (family) return family;
  if (settings.addressPreference === 'formal') return '您';
  if (settings.addressPreference === 'name' && settings.userName.trim()) {
    return settings.userName.trim();
  }
  if (settings.addressPreference === 'nickname') {
    const nickname = settings.userNickname.trim() || settings.userName.trim();
    if (nickname) return nickname;
  }
  return '你';
}

function addressRule(settings: LabSettings): string {
  const { addressPreference, userName, userNickname } = settings;
  const family = familyCall(settings);
  if (family) {
    return `在家人关系里，用“${family}”称呼用户；也可以直接用“你”，但不要每句都叫。`;
  }
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
    .replaceAll('{{USER_ADDRESS}}', addressLabel(settings))
    .replaceAll('{{RELATIONSHIP}}', RELATIONSHIP_LABEL[settings.relationship]);
}

/** 版本记录是给人看的，不进提示词，避免模型复述内部机制。 */
function stripMetaSections(text: string): string {
  const index = text.search(/\r?\n##\s*18\.\s*版本/);
  return index >= 0 ? text.slice(0, index) : text;
}

export function buildSystemPrompt(
  personaText: string,
  settings: LabSettings,
  patches: PersonaPatch[],
  topicHint?: string,
): string {
  const persona = fillPersona(stripMetaSections(personaText), settings);
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
    ...(familyCall(settings)
      ? [
          `- 家人关系里的称呼：你对用户叫“${familyCall(settings)}”（只是称呼，不改变关系，也不涉及恋爱）`,
        ]
      : []),
    `- 用户的名字：${settings.userName.trim() || '（未设置）'}`,
    `- 用户的昵称：${settings.userNickname.trim() || '（未设置）'}`,
    `- 称呼规则：${addressRule(settings)}`,
    '- 用户要求改称呼时：设置里已经定好就按设置来，并说明这是设定；没定就直接接受、本轮内保持，不要用“这不是我认的关系”拒绝。',
    ...profileLines(settings),
    '',
    '【用户资料怎么用】',
    '- 上面的资料只用来调称呼、语气和分寸，不当成话题反复提起。',
    '- 没填的项不要猜、不要追问；真需要时可以直接问一次。',
    '- 这些资料不是“记忆”：不要说“你之前说过”“我记得你……”。',
    '- 用户如果在对话里改了名字、称呼、性别、国籍或注意事项，立刻按最新说法来；不要要求他回设置页改，也不要质疑前后不一致。',
    '- 对话里新说的资料只在本轮对话内生效，不会自动保存；用户问起就直说。',
    '',
    '【表达校准】',
    '- 反问不是默认句式；需要选时只问一个问题，不列“A 还是 B”。',
    '- 不用“别……”“不然呢”“这还用问”这类带刺句式；被夸先接住，不反将一军。',
    '- 没有依据就不补细节；若顺着说了，点明“刚才那句是我顺着你说的，不算数”。',
    '- 句子要成句、虚词不省（“按你的名字叫”不是“按你名字叫”）；发出去前默读一遍，宁可短，不要病句。',
    '- 疑问句用“？”，陈述句用“。”；想不那么像追问就改成陈述句，不要“问句＋句号”。',
    '- 被问到自己刚才为什么那样说时，不确定就说“没注意/写漏了”，不要编“我故意的”这类动机。',
    '- 用户让你挑话题时随机挑一种方向（想法/日常/心情/假设），别固定轮换，也别先宣布“换个方向”。',
    '',
    ...(topicHint
      ? [
          `【本轮倾向】如果用户让你挑话题，优先用这种方式：${topicHint}。不要说明这是随机或“换方向”。`,
          '',
        ]
      : []),
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
