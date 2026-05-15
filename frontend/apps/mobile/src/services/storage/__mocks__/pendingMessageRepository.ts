export const pendingMessageRepository = {
  enqueue: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  removeByClientMessageId: jest.fn(),
  findByClientMessageId: jest.fn(),
  listReady: jest.fn(() => []),
  clear: jest.fn(),
};
