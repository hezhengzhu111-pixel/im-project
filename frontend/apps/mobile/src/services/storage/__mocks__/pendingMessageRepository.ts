export const pendingMessageRepository = {
  enqueue: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  removeByClientMessageId: jest.fn(),
  findByClientMessageId: jest.fn(),
  listReady: jest.fn(() => []),
  listReadyToSend: jest.fn(() => []),
  listAll: jest.fn(() => []),
  clear: jest.fn(),
};
