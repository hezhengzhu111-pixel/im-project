import { mediaService, buildVoiceFile } from '../mediaService';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { pick, keepLocalCopy, types } from '@react-native-documents/picker';
import NitroSound from 'react-native-nitro-sound';
import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeBlobUtil from 'react-native-blob-util';

jest.mock('@/app/permissions/permissions', () => ({
  permissions: {
    camera: jest.fn(),
    microphone: jest.fn(),
    media: jest.fn(),
  },
}));

import { permissions } from '@/app/permissions/permissions';

const mockPermissions = permissions as jest.Mocked<typeof permissions>;

describe('mediaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── takePhoto ────────────────────────────────────────────────────────────

  describe('takePhoto', () => {
    it('returns null if camera permission denied', async () => {
      mockPermissions.camera.mockResolvedValue(false);

      const result = await mediaService.takePhoto();

      expect(result).toBeNull();
      expect(launchCamera).not.toHaveBeenCalled();
    });

    it('captures photo and returns normalized MobileFile', async () => {
      mockPermissions.camera.mockResolvedValue(true);
      (launchCamera as jest.Mock).mockResolvedValue({
        assets: [
          {
            uri: 'file:///camera/photo.jpg',
            fileName: 'photo.jpg',
            type: 'image/jpeg',
            fileSize: 102400,
          },
        ],
      });

      const result = await mediaService.takePhoto();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('photo.jpg');
      expect(result!.type).toBe('image/jpeg');
      expect(result!.size).toBe(102400);
    });

    it('returns null when no assets returned', async () => {
      mockPermissions.camera.mockResolvedValue(true);
      (launchCamera as jest.Mock).mockResolvedValue({ assets: [] });

      const result = await mediaService.takePhoto();

      expect(result).toBeNull();
    });

    it('returns null when launchCamera returns null assets', async () => {
      mockPermissions.camera.mockResolvedValue(true);
      (launchCamera as jest.Mock).mockResolvedValue({});

      const result = await mediaService.takePhoto();

      expect(result).toBeNull();
    });
  });

  // ── pickImage ────────────────────────────────────────────────────────────

  describe('pickImage', () => {
    it('returns null if media permission denied', async () => {
      mockPermissions.media.mockResolvedValue(false);

      const result = await mediaService.pickImage();

      expect(result).toBeNull();
      expect(launchImageLibrary).not.toHaveBeenCalled();
    });

    it('picks image from library and returns normalized file', async () => {
      mockPermissions.media.mockResolvedValue(true);
      (launchImageLibrary as jest.Mock).mockResolvedValue({
        assets: [
          {
            uri: 'file:///library/photo.png',
            fileName: 'photo.png',
            type: 'image/png',
            fileSize: 204800,
          },
        ],
      });

      const result = await mediaService.pickImage();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('photo.png');
      expect(result!.type).toBe('image/png');
    });

    it('requests mixed media type', async () => {
      mockPermissions.media.mockResolvedValue(true);
      (launchImageLibrary as jest.Mock).mockResolvedValue({ assets: [] });

      await mediaService.pickImage();

      expect(launchImageLibrary).toHaveBeenCalledWith({
        mediaType: 'mixed',
        selectionLimit: 1,
        includeExtra: true,
        assetRepresentationMode: 'current',
      });
    });

    it('returns null when no assets returned', async () => {
      mockPermissions.media.mockResolvedValue(true);
      (launchImageLibrary as jest.Mock).mockResolvedValue({});

      const result = await mediaService.pickImage();

      expect(result).toBeNull();
    });
  });

  // ── pickDocument ─────────────────────────────────────────────────────────

  describe('pickDocument', () => {
    it('picks document and resolves content:// URIs', async () => {
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'content://documents/file.pdf',
          name: 'document.pdf',
          type: 'application/pdf',
          size: 500000,
        },
      ]);
      (keepLocalCopy as jest.Mock).mockResolvedValue([
        { status: 'success', localUri: 'file:///cache/document.pdf' },
      ]);
      // Mock ReactNativeBlobUtil.fs.stat for size
      const mockedFs = ReactNativeBlobUtil.fs as jest.Mocked<typeof ReactNativeBlobUtil.fs>;
      mockedFs.stat.mockResolvedValue({ path: '/cache/document.pdf', size: 500000, lastModified: 0, type: 'file' as const, filename: 'document.pdf' });

      const result = await mediaService.pickDocument();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('document.pdf');
      expect(result!.type).toBe('application/pdf');
    });

    it('returns null when no document picked', async () => {
      (pick as jest.Mock).mockResolvedValue([]);

      const result = await mediaService.pickDocument();

      expect(result).toBeNull();
    });

    it('handles non-content:// URIs without keepLocalCopy', async () => {
      (pick as jest.Mock).mockResolvedValue([
        {
          uri: 'file:///documents/report.txt',
          name: 'report.txt',
          type: 'text/plain',
          size: 1000,
        },
      ]);
      const mockedFs = ReactNativeBlobUtil.fs as jest.Mocked<typeof ReactNativeBlobUtil.fs>;
      mockedFs.stat.mockResolvedValue({ path: '/documents/report.txt', size: 1000, lastModified: 0, type: 'file' as const, filename: 'report.txt' });

      const result = await mediaService.pickDocument();

      expect(result).not.toBeNull();
      expect(keepLocalCopy).not.toHaveBeenCalled();
    });
  });

  // ── startVoiceRecording ──────────────────────────────────────────────────

  describe('startVoiceRecording', () => {
    it('starts recorder when microphone permission granted', async () => {
      mockPermissions.microphone.mockResolvedValue(true);

      const result = await mediaService.startVoiceRecording('/tmp/test.m4a');

      expect(result).toBe('/tmp/test.m4a');
      expect(NitroSound.startRecorder).toHaveBeenCalledWith('/tmp/test.m4a');
    });

    it('throws when microphone permission denied', async () => {
      mockPermissions.microphone.mockResolvedValue(false);

      await expect(mediaService.startVoiceRecording('/tmp/test.m4a')).rejects.toThrow(
        'Microphone permission denied',
      );
      expect(NitroSound.startRecorder).not.toHaveBeenCalled();
    });

    it('uses default path when not provided', async () => {
      mockPermissions.microphone.mockResolvedValue(true);
      (ReactNativeBlobUtil.fs.dirs as { CacheDir: string }).CacheDir = '/cache';

      const result = await mediaService.startVoiceRecording();
      const expectedDefaultPath = '/cache/voice_';

      expect(result).toContain(expectedDefaultPath);
      expect(result).toMatch(/\.m4a$/);
    });
  });

  // ── stopVoiceRecording ───────────────────────────────────────────────────

  describe('stopVoiceRecording', () => {
    it('stops recorder and builds voice file', async () => {
      (NitroSound.stopRecorder as jest.Mock).mockResolvedValue('/tmp/voice.m4a');

      const result = await mediaService.stopVoiceRecording(5000);

      expect(NitroSound.stopRecorder).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result.type).toBe('audio/mp4');
      expect(result.duration).toBe(5000);
    });
  });

  // ── playAudio / stopAudio ────────────────────────────────────────────────

  describe('playAudio', () => {
    it('calls NitroSound.startPlayer', () => {
      mediaService.playAudio('http://example.com/audio.mp3');

      expect(NitroSound.startPlayer).toHaveBeenCalledWith('http://example.com/audio.mp3');
    });
  });

  describe('stopAudio', () => {
    it('calls NitroSound.stopPlayer', () => {
      mediaService.stopAudio();

      expect(NitroSound.stopPlayer).toHaveBeenCalled();
    });
  });

  // ── copyText ─────────────────────────────────────────────────────────────

  describe('copyText', () => {
    it('copies text to clipboard', () => {
      mediaService.copyText('Hello World');

      expect(Clipboard.setString).toHaveBeenCalledWith('Hello World');
    });
  });

  // ── buildVoiceFile (exported function) ───────────────────────────────────

  describe('buildVoiceFile', () => {
    it('builds voice file from uri', async () => {
      const result = await buildVoiceFile('/tmp/voice.m4a', 3000);

      expect(result).not.toBeNull();
      expect(result.uri).toBe('file:///tmp/voice.m4a');
      expect(result.type).toBe('audio/mp4');
      expect(result.duration).toBe(3000);
    });

    it('infers name from uri', async () => {
      const result = await buildVoiceFile('/tmp/audio_recording.m4a', undefined);

      expect(result.name).toContain('audio_recording');
    });

    it('provides default name with .m4a when uri has no extension', async () => {
      const result = await buildVoiceFile('/tmp/noname', 1000);

      expect(result.name).toMatch(/voice_\d+\.m4a/);
    });
  });
});
