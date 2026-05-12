export const createClientMessageId = (): string =>
  `cm_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const createLocalMessageId = (): string =>
  `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export const createConversationId = (type: 'private' | 'group', currentUserId: string, targetId: string): string =>
  type === 'group' ? `group_${targetId}` : `private_${currentUserId}_${targetId}`;
