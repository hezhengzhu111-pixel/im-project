export const messageRepository = {
  upsertSession: jest.fn(),
  listSessions: jest.fn(() => []),
  upsertMessages: jest.fn(),
  listMessages: jest.fn(() => []),
  listMessagesPage: jest.fn(() => ({ messages: [], hasMore: false })),
  clearConversation: jest.fn(),
};
