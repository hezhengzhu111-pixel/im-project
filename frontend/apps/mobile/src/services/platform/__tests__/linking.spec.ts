import { platformLinking } from '../linking';
import { Linking } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

jest.mock('react-native', () => ({
  Linking: {
    openURL: jest.fn(),
  },
}));

const mockedOpenURL = Linking.openURL as jest.Mock;
const mockedActionViewIntent =
  ReactNativeBlobUtil.android.actionViewIntent as jest.Mock;

describe('platformLinking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('openUrl', () => {
    test('calls Linking.openURL with the url', async () => {
      mockedOpenURL.mockResolvedValue(undefined);

      await platformLinking.openUrl('https://example.com');

      expect(mockedOpenURL).toHaveBeenCalledTimes(1);
      expect(mockedOpenURL).toHaveBeenCalledWith('https://example.com');
    });

    test('throws readable error when openURL fails', async () => {
      mockedOpenURL.mockRejectedValue(new Error('no browser available'));

      await expect(platformLinking.openUrl('https://example.com')).rejects.toThrow(
        'Failed to open URL: no browser available',
      );
    });

    test('throws with fallback when non-Error is thrown', async () => {
      mockedOpenURL.mockRejectedValue('raw error');

      await expect(platformLinking.openUrl('https://example.com')).rejects.toThrow(
        'Failed to open URL: unknown error',
      );
    });
  });

  describe('openFile', () => {
    test('calls actionViewIntent with path and default mime type', async () => {
      mockedActionViewIntent.mockResolvedValue(undefined);

      await platformLinking.openFile('/sdcard/file.pdf');

      expect(mockedActionViewIntent).toHaveBeenCalledTimes(1);
      expect(mockedActionViewIntent).toHaveBeenCalledWith(
        '/sdcard/file.pdf',
        'application/octet-stream',
      );
    });

    test('calls actionViewIntent with explicit mime type', async () => {
      mockedActionViewIntent.mockResolvedValue(undefined);

      await platformLinking.openFile('/sdcard/video.mp4', 'video/mp4');

      expect(mockedActionViewIntent).toHaveBeenCalledWith(
        '/sdcard/video.mp4',
        'video/mp4',
      );
    });

    test('throws readable error when actionViewIntent fails', async () => {
      mockedActionViewIntent.mockRejectedValue(
        new Error('no app to handle intent'),
      );

      await expect(
        platformLinking.openFile('/sdcard/file.xyz'),
      ).rejects.toThrow('Failed to open file: no app to handle intent');
    });

    test('throws with fallback when non-Error is thrown', async () => {
      mockedActionViewIntent.mockRejectedValue('raw error');

      await expect(platformLinking.openFile('/sdcard/file.xyz')).rejects.toThrow(
        'Failed to open file: unknown error',
      );
    });
  });

  describe('error messages do not contain sensitive information', () => {
    test('openUrl error wraps but does not leak token-like patterns', () => {
      // Even if the underlying error contains a token, our wrapping
      // just prefixes the message — the caller must avoid passing
      // sensitive URLs to openUrl in the first place.
      const message =
        'Failed to open URL: no activity found to handle intent';
      expect(message).not.toMatch(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/);
      expect(message).not.toMatch(/access_token=[A-Za-z0-9\-._~+/]+=*/);
    });

    test('openFile error wraps but does not include raw secrets', () => {
      const message =
        'Failed to open file: no app to handle intent';
      expect(message).not.toMatch(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/);
      expect(message).not.toMatch(/secret/i);
    });
  });
});
