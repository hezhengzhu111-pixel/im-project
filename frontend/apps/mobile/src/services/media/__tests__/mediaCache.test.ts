import { mediaCache } from '../mediaCache';

// Override the setup.tsx mock for react-native-blob-util to add config, fs.exists, fs.unlink
jest.mock('react-native-blob-util', () => ({
  fs: {
    dirs: { CacheDir: '/tmp' },
    stat: jest.fn((path: string) => Promise.resolve({ path, size: '128' })),
    exists: jest.fn(),
    unlink: jest.fn(),
  },
  config: jest.fn(),
  android: { actionViewIntent: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/constants/config', () => ({
  STORAGE_KEYS: {
    accessToken: 'im.mobile.access-token',
  },
}));

jest.mock('@/services/storage/secureStorage', () => ({
  secureStorage: {
    get: jest.fn(),
  },
}));

jest.mock('../mediaUri', () => ({
  isLocalUri: jest.fn((uri: string | null | undefined) => /^(file:|content:)/i.test(String(uri || '').trim())),
  mediaExtensionFromUri: jest.fn((uri: string | null | undefined) => {
    const raw = String(uri || '');
    const match = raw.match(/\.(\w+)(?:[?#]|$)/);
    return match ? match[1].toLowerCase() : 'bin';
  }),
}));

// We need to access the mocked fs and config after jest.mock calls are processed.
// By the time tests run, the import will have the mocked version with all methods.
import ReactNativeBlobUtil from 'react-native-blob-util';

const mockedFs = ReactNativeBlobUtil.fs as jest.Mocked<typeof ReactNativeBlobUtil.fs>;

describe('mediaCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── localPath ────────────────────────────────────────────────────────────

  describe('localPath', () => {
    it('returns empty string for empty uri', async () => {
      const result = await mediaCache.localPath('');
      expect(result).toBe('');
    });

    it('returns file:// stripped path for file:// uri', async () => {
      const result = await mediaCache.localPath('file:///data/im-files/test.jpg');
      expect(result).toBe('/data/im-files/test.jpg');
    });

    it('returns content:// uri as-is (local uri)', async () => {
      const result = await mediaCache.localPath('content://media/external/images/1');
      expect(result).toBe('content://media/external/images/1');
    });

    it('returns raw path for non-http, non-local uri', async () => {
      const result = await mediaCache.localPath('/absolute/path/file.pdf');
      expect(result).toBe('/absolute/path/file.pdf');
    });

    it('downloads http uri if not cached', async () => {
      // Mock file does NOT exist
      mockedFs.exists.mockResolvedValue(false);

      // Mock download
      const mockFetch = jest.fn().mockResolvedValue({
        info: () => ({ status: 200 }),
      });
      (ReactNativeBlobUtil.config as jest.Mock).mockReturnValue({
        fetch: mockFetch,
      });

      const result = await mediaCache.localPath('http://example.com/img.jpg', 'jpg');

      // sanitizeName preserves dots and dashes; replaces :// → ___ and / → _
      const expectedPath = '/tmp/im_media_v4_http___example.com_img.jpg.jpg';
      expect(mockedFs.exists).toHaveBeenCalledWith(expectedPath);
      expect(ReactNativeBlobUtil.config).toHaveBeenCalledWith({
        path: expectedPath,
        fileCache: true,
      });
      expect(result).toBe(expectedPath);
    });

    it('reuses cached file without downloading again', async () => {
      // Mock file already exists
      mockedFs.exists.mockResolvedValue(true);

      const result = await mediaCache.localPath('http://example.com/img.jpg', 'jpg');

      const expectedPath = '/tmp/im_media_v4_http___example.com_img.jpg.jpg';
      expect(mockedFs.exists).toHaveBeenCalledWith(expectedPath);
      expect(ReactNativeBlobUtil.config).not.toHaveBeenCalled();
      expect(result).toBe(expectedPath);
    });

    it('throws on non-200 download response', async () => {
      mockedFs.exists.mockResolvedValue(false);

      const mockFetch = jest.fn().mockResolvedValue({
        info: () => ({ status: 404 }),
      });
      (ReactNativeBlobUtil.config as jest.Mock).mockReturnValue({
        fetch: mockFetch,
      });

      await expect(mediaCache.localPath('http://example.com/notfound.jpg', 'jpg')).rejects.toThrow(
        'media download failed: HTTP 404',
      );
    });

    it('sanitizes special characters in URI for cache filename', async () => {
      mockedFs.exists.mockResolvedValue(false);

      const mockFetch = jest.fn().mockResolvedValue({
        info: () => ({ status: 200 }),
      });
      (ReactNativeBlobUtil.config as jest.Mock).mockReturnValue({
        fetch: mockFetch,
      });

      // sanitizeName preserves [a-zA-Z0-9._-], replaces everything else with _
      await mediaCache.localPath('http://example.com/path/file?query=1&param=2#fragment', 'jpg');

      const expectedKey = 'http___example.com_path_file_query_1_param_2_fragment';
      expect(ReactNativeBlobUtil.config).toHaveBeenCalledWith({
        path: expect.stringContaining(expectedKey),
        fileCache: true,
      });
    });
  });

  // ── imageUri ─────────────────────────────────────────────────────────────

  describe('imageUri', () => {
    it('returns file:// prefixed local path string', async () => {
      mockedFs.exists.mockResolvedValue(true);

      const result = await mediaCache.imageUri('http://example.com/photo.jpg');

      // sanitizeName preserves dots, so example.com stays as example.com
      expect(result).toBe('file:///tmp/im_media_v4_http___example.com_photo.jpg.jpg');
    });

    it('returns empty string for empty input', async () => {
      const result = await mediaCache.imageUri('');
      expect(result).toBe('');
    });

    it('returns content:// uri as-is', async () => {
      const result = await mediaCache.imageUri('content://media/external/images/1');
      expect(result).toBe('content://media/external/images/1');
    });

    it('returns file:// uri as-is', async () => {
      const result = await mediaCache.imageUri('file:///data/test.png');
      expect(result).toBe('file:///data/test.png');
    });
  });
});
