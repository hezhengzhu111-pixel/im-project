export interface PlainToken {
  type: "plain";
  text: string;
}

export interface MentionToken {
  type: "mention";
  text: string;
}

export type MessageToken = PlainToken | MentionToken;

const MENTION_RE = /@(\S+)/g;

/**
 * 将消息文本解析为 token 数组。
 * - plain: 普通文本段
 * - mention: @提及，text 包含 @ 前缀
 *
 * 空文本返回空数组。
 */
export function parseMessageTokens(text: string): MessageToken[] {
  if (!text) return [];

  const tokens: MessageToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MENTION_RE)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      tokens.push({ type: "plain", text: text.slice(lastIndex, matchIndex) });
    }
    tokens.push({ type: "mention", text: match[0] });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "plain", text: text.slice(lastIndex) });
  }

  return tokens;
}
