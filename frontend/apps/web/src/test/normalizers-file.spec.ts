/**
 * Tests for the `normalizeFileUploadResponse` function re-exported from @/normalizers/file.
 *
 * The web normalizer is a re-export from @im/shared-normalizers, so these tests
 * verify both the re-export identity and the functional behavior.
 *
 * Note: `resolveFilePath` is defined in `@/services/file.ts` and is already
 * tested in `file-service.spec.ts`.
 */
import { describe, it, expect } from 'vitest';
import { normalizeFileUploadResponse as webNormalizeFileUploadResponse } from '@/normalizers/file';
import { normalizeFileUploadResponse as sharedNormalizeFileUploadResponse } from '@im/shared-normalizers';

describe('normalizers/file: re-export identity', () => {
  it('normalizeFileUploadResponse is the same reference as @im/shared-normalizers', () => {
    expect(webNormalizeFileUploadResponse).toBe(sharedNormalizeFileUploadResponse);
  });

  it('produces identical output for the same input', () => {
    const raw = {
      url: '/files/images/2026-04-28/a.png',
      original_filename: 'avatar.png',
      filename: 'a.png',
      category: 'images',
    };
    expect(webNormalizeFileUploadResponse(raw)).toEqual(
      sharedNormalizeFileUploadResponse(raw),
    );
  });
});

describe('normalizeFileUploadResponse', () => {
  it('normalizes a full file upload response with snake_case fields', () => {
    const raw = {
      url: '/files/images/2026-04-28/a.png',
      thumbnail_url: '/files/images/2026-04-28/a_thumb.png',
      original_filename: 'avatar.png',
      filename: 'a.png',
      content_type: 'image/png',
      category: 'images',
      upload_date: '2026-04-28',
      upload_time: 1777350000000,
      uploader_id: '1',
      size: '12345',
    };

    const result = webNormalizeFileUploadResponse(raw);
    expect(result.url).toBe('/files/images/2026-04-28/a.png');
    expect(result.thumbnailUrl).toBe('/files/images/2026-04-28/a_thumb.png');
    expect(result.originalFilename).toBe('avatar.png');
    expect(result.filename).toBe('a.png');
    expect(result.contentType).toBe('image/png');
    expect(result.category).toBe('images');
    expect(result.uploadDate).toBe('2026-04-28');
    expect(result.uploadTime).toBe(1777350000000);
    expect(result.uploaderId).toBe('1');
    expect(result.size).toBe(12345);
  });

  it('normalizes with camelCase fields', () => {
    const raw = {
      url: '/files/documents/2026-05-01/report.pdf',
      thumbnailUrl: '/files/documents/2026-05-01/report_thumb.png',
      originalFilename: 'report.pdf',
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      category: 'documents',
      uploadDate: '2026-05-01',
      uploadTime: 1777500000000,
      uploaderId: '42',
      size: 2048576,
    };

    const result = webNormalizeFileUploadResponse(raw);
    expect(result.url).toBe('/files/documents/2026-05-01/report.pdf');
    expect(result.originalFilename).toBe('report.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.fileName).toBe('report.pdf');
    expect(result.size).toBe(2048576);
    expect(result.uploaderId).toBe('42');
  });

  it('handles missing optional fields', () => {
    const raw = {
      url: '/files/images/test.jpg',
      filename: 'test.jpg',
    };

    const result = webNormalizeFileUploadResponse(raw);
    expect(result.url).toBe('/files/images/test.jpg');
    expect(result.thumbnailUrl).toBeUndefined();
    expect(result.originalFilename).toBeUndefined();
    expect(result.contentType).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.uploadDate).toBeUndefined();
    expect(result.uploadTime).toBeUndefined();
    expect(result.uploaderId).toBeUndefined();
    expect(result.fileName).toBe('test.jpg');
  });

  it('handles null input gracefully', () => {
    const result = webNormalizeFileUploadResponse(null);
    expect(result.url).toBe('');
    expect(result.thumbnailUrl).toBeUndefined();
    expect(result.originalFilename).toBeUndefined();
  });

  it('handles undefined input gracefully', () => {
    const result = webNormalizeFileUploadResponse(undefined);
    expect(result.url).toBe('');
  });

  it('handles non-object input gracefully', () => {
    const result = webNormalizeFileUploadResponse('string input');
    expect(result.url).toBe('');
  });

  it('fileName falls back to originalFilename then filename', () => {
    // fileName not present, should fallback: originalFilename || filename
    const raw1 = {
      url: '/f/test.jpg', originalFilename: 'original.jpg', filename: 'file.jpg',
    };
    expect(webNormalizeFileUploadResponse(raw1).fileName).toBe('original.jpg');

    // only filename
    const raw2 = { url: '/f/test.jpg', filename: 'file.jpg' };
    expect(webNormalizeFileUploadResponse(raw2).fileName).toBe('file.jpg');
  });

  it('coerces numeric size to number, omits non-finite', () => {
    const rawNumeric = {
      url: '/f/test.jpg', filename: 'test.jpg', size: '1024',
    };
    expect(webNormalizeFileUploadResponse(rawNumeric).size).toBe(1024);

    const rawNaN = {
      url: '/f/test.jpg', filename: 'test.jpg', size: 'not-a-number',
    };
    expect(webNormalizeFileUploadResponse(rawNaN).size).toBeUndefined();
  });

  it('handles empty file_name and originalFilename', () => {
    const raw = {
      url: '/f/test.jpg', filename: '',
      original_filename: '', file_name: '',
    };
    const result = webNormalizeFileUploadResponse(raw);
    // empty strings become undefined via || undefined coalescing
    expect(result.filename).toBeUndefined();
    expect(result.fileName).toBeUndefined();
  });

  it('supports audio files', () => {
    const raw = {
      url: '/files/audios/2026-05-10/voice.webm',
      original_filename: 'voice.webm',
      filename: 'voice.webm',
      content_type: 'audio/webm',
      category: 'audios',
      upload_date: '2026-05-10',
      upload_time: 1777600000000,
      uploader_id: '10',
      size: '51200',
    };

    const result = webNormalizeFileUploadResponse(raw);
    expect(result.category).toBe('audios');
    expect(result.contentType).toBe('audio/webm');
    expect(result.size).toBe(51200);
  });

  it('supports video files', () => {
    const raw = {
      url: '/files/videos/2026-05-11/clip.mp4',
      originalFilename: 'clip.mp4',
      fileName: 'clip.mp4',
      contentType: 'video/mp4',
      category: 'videos',
      fileType: 'mp4',
      uploadDate: '2026-05-11',
      uploadTime: 1777700000000,
      uploaderId: '20',
      size: 104857600,
    };

    const result = webNormalizeFileUploadResponse(raw);
    expect(result.category).toBe('videos');
    expect(result.contentType).toBe('video/mp4');
    expect(result.fileType).toBe('mp4');
    expect(result.size).toBe(104857600);
  });

  it('handles empty url gracefully', () => {
    const result = webNormalizeFileUploadResponse({ url: '' });
    expect(result.url).toBe('');
    expect(result.thumbnailUrl).toBeUndefined();
  });
});
