const UNSUPPORTED_ERROR = 'Save to device gallery is not available: no native save capability configured';

export const mediaSaveService = {
  async saveImage(_uri: string): Promise<void> {
    throw new Error(UNSUPPORTED_ERROR);
  },

  async saveVideo(_uri: string): Promise<void> {
    throw new Error(UNSUPPORTED_ERROR);
  },
};
