export const messageRepository = {
  upsertSession: jest.fn(),
  listSessions: jest.fn(() => []),
  upsertMessages: jest.fn(),
  listMessages: jest.fn(() => []),
  clearConversation: jest.fn(),
};
