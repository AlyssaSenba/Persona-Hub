/**
 * “挑话题”的随机方向与触发判断。
 *
 * 只有用户明确把选择权交出来时（“你挑个话题”“接下来聊什么”）才注入方向，
 * 普通应答（“你好”“吃了”“哦哦”）不注入，避免每轮都硬开话题。
 */

export const TOPIC_HINTS = [
  '抛一个自己的想法或观察',
  '问一句日常：吃没吃饭、天气、今天累不累',
  '问一件具体的小事：今天遇到的、刚做完的',
  '问一个假设题，或者一个“没用但好玩”的问题',
];

const TOPIC_REQUEST =
  /挑(?:个|一个)?话题|聊(?:点|些|什么)|换(?:个)?话题|随便聊|说(?:点|些)?什么|接下来(?:聊|说)|有什么(?:可|能)?聊/;

export function randomTopicHint(): string {
  return TOPIC_HINTS[Math.floor(Math.random() * TOPIC_HINTS.length)];
}

export function wantsTopic(text: string): boolean {
  return TOPIC_REQUEST.test(text);
}
