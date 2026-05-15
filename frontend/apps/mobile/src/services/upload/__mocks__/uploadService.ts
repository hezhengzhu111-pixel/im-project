export const uploadService = {
  createTask: jest.fn(() => ({ taskId: 'upload_1' })),
  uploadExistingTask: jest.fn(),
  retryPendingUploads: jest.fn(() => Promise.resolve()),
};
