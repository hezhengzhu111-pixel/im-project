import { platformClipboard } from '../clipboard';
import Clipboard from '@react-native-clipboard/clipboard';

const mockedSetString = Clipboard.setString as jest.MockedFunction<
  typeof Clipboard.setString
>;

describe('platformClipboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('copyText', () => {
    test('calls Clipboard.setString with the text', () => {
      platformClipboard.copyText('hello');

      expect(mockedSetString).toHaveBeenCalledTimes(1);
      expect(mockedSetString).toHaveBeenCalledWith('hello');
    });

    test('calls Clipboard.setString with empty string', () => {
      platformClipboard.copyText('');

      expect(mockedSetString).toHaveBeenCalledTimes(1);
      expect(mockedSetString).toHaveBeenCalledWith('');
    });

    test('throws readable error when setString fails', () => {
      mockedSetString.mockImplementation(() => {
        throw new Error('clipboard unavailable');
      });

      expect(() => platformClipboard.copyText('hello')).toThrow(
        'Failed to copy text: clipboard unavailable',
      );
    });

    test('throws with fallback message when non-Error is thrown', () => {
      mockedSetString.mockImplementation(() => {
        throw 'raw string error';
      });

      expect(() => platformClipboard.copyText('hello')).toThrow(
        'Failed to copy text: unknown error',
      );
    });
  });
});
