import { mediaSaveService } from '../mediaSaveService';

describe('mediaSaveService', () => {
  describe('saveImage', () => {
    test('throws unsupported error', async () => {
      await expect(mediaSaveService.saveImage('file:///tmp/test.png')).rejects.toThrow(
        'Save to device gallery is not available',
      );
    });

    test('error message does not include the uri', async () => {
      await expect(
        mediaSaveService.saveImage('file:///tmp/private/image.png'),
      ).rejects.toThrow('Save to device gallery is not available');
    });
  });

  describe('saveVideo', () => {
    test('throws unsupported error', async () => {
      await expect(mediaSaveService.saveVideo('file:///tmp/test.mp4')).rejects.toThrow(
        'Save to device gallery is not available',
      );
    });

    test('error message does not include the uri', async () => {
      await expect(
        mediaSaveService.saveVideo('file:///tmp/private/video.mp4'),
      ).rejects.toThrow('Save to device gallery is not available');
    });
  });
});
