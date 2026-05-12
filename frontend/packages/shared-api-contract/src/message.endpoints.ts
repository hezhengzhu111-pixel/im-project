export const MESSAGE_ENDPOINTS = {
  SEND_PRIVATE: '/message/send/private',
  SEND_GROUP: '/message/send/group',
  PRIVATE_HISTORY: '/message/private/:friendId',
  PRIVATE_HISTORY_CURSOR: '/message/private/:friendId/cursor',
  GROUP_HISTORY: '/message/group/:groupId',
  GROUP_HISTORY_CURSOR: '/message/group/:groupId/cursor',
  CONVERSATIONS: '/message/conversations',
  MARK_READ: '/message/read/:conversationId',
  RECALL: '/message/recall/:messageId',
  DELETE: '/message/delete/:messageId',
  CONFIG: '/message/config',
} as const;
