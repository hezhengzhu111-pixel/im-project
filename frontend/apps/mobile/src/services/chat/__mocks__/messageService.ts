export const messageService = {
  sendPrivate: jest.fn(),
  sendGroup: jest.fn(),
  getPrivateHistory: jest.fn(),
  getGroupHistory: jest.fn(),
  markRead: jest.fn(),
  getConversations: jest.fn(),
  getConfig: jest.fn(),
};

export const resolveMarkReadTarget = jest.fn(() => ({
  userId: '100',
  conversationId: '100_200',
}));
