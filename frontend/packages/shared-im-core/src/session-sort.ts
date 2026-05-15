import type { ChatSession } from "@im/shared-types";

/**
 * 将 lastActiveTime 转为有效的时间戳毫秒数。
 * undefined、空字符串、无效日期字符串均返回 0。
 */
const parseSessionTime = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * 判断会话是否置顶。兼容 isPinned 和 pinned 两个字段。
 */
const isSessionPinned = (session: ChatSession): boolean =>
  Boolean(session.isPinned ?? session.pinned);

/**
 * 比较两个会话的排序优先级。
 *
 * 排序规则：
 * 1. 置顶会话优先
 * 2. lastActiveTime 晚的排前面
 * 3. 无效时间按 0 处理
 * 4. 时间相同保持输入顺序
 *
 * @returns 负数表示 left 排前面，正数表示 right 排前面，0 表示相等
 */
export const compareSessions = (left: ChatSession, right: ChatSession): number => {
  const leftPinned = isSessionPinned(left);
  const rightPinned = isSessionPinned(right);
  if (leftPinned !== rightPinned) {
    return leftPinned ? -1 : 1;
  }

  const leftTime = parseSessionTime(left.lastActiveTime);
  const rightTime = parseSessionTime(right.lastActiveTime);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return 0;
};

/**
 * 对会话列表排序。返回新数组，不修改输入。
 *
 * 排序规则：
 * 1. isPinned/pinned 置顶会话优先（字段归一化在函数内部完成）
 * 2. lastActiveTime 晚的排前面
 * 3. 无效时间按 0 处理
 * 4. 时间相同保持输入顺序
 */
export const sortSessions = (sessions: ChatSession[]): ChatSession[] =>
  [...sessions].sort(compareSessions);
