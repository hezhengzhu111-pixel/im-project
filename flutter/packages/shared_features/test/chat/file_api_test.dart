import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

import '../helpers/fakes.dart';

void main() {
  group('FileApi', () {
    late FakeHttpClientPort http;
    late FakeAnalyticsPort analytics;
    late FileApi api;

    setUp(() {
      http = FakeHttpClientPort();
      analytics = FakeAnalyticsPort();
      api = FileApi(http, analytics);
    });

    test('uploadImage uses POST /api/file/upload/image', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.uploadImage);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'url': 'https://cdn.example.com/img.png',
            'name': 'img.png',
            'size': 1024,
          }),
        );
      };

      final result =
          await api.uploadImage(Uint8List(0), 'img.png');
      expect(result.url, 'https://cdn.example.com/img.png');
      expect(result.name, 'img.png');
      expect(result.size, 1024);
    });

    test('uploadFile uses POST /api/file/upload/file', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.uploadFile);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'url': '/f/doc.pdf', 'name': 'doc.pdf', 'size': 2048}),
        );
      };

      final result = await api.uploadFile(Uint8List(0), 'doc.pdf');
      expect(result.url, '/f/doc.pdf');
    });

    test('uploadAudio uses POST /api/file/upload/audio', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.uploadAudio);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'url': '/f/audio.mp3', 'name': 'audio.mp3', 'size': 512}),
        );
      };

      final result = await api.uploadAudio(Uint8List(0), 'audio.mp3');
      expect(result.url, '/f/audio.mp3');
    });

    test('uploadVideo uses POST /api/file/upload/video', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.uploadVideo);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'url': '/f/video.mp4', 'name': 'video.mp4', 'size': 4096}),
        );
      };

      final result = await api.uploadVideo(Uint8List(0), 'video.mp4');
      expect(result.url, '/f/video.mp4');
    });

    test('uploadAvatar uses POST /api/file/upload/avatar', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.uploadAvatar);
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'url': 'https://cdn.example.com/avatar.png',
            'name': 'avatar.png',
            'size': 512,
          }),
        );
      };

      final result = await api.uploadAvatar(Uint8List(0), 'avatar.png');
      expect(result.url, 'https://cdn.example.com/avatar.png');
    });

    test('downloadByGet uses GET /api/file/download', () async {
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.download);
        expect(queryParameters, {'fileId': 'f1', 'token': 'tok'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'url': 'https://cdn.example.com/f1'}),
        );
      };

      final result = await api.downloadByGet(fileId: 'f1', token: 'tok');
      expect(result['url'], 'https://cdn.example.com/f1');
    });

    test('downloadByPost uses POST /api/file/download', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.download);
        expect(body, {'fileId': 'f2'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'url': 'https://cdn.example.com/f2'}),
        );
      };

      final result = await api.downloadByPost(fileId: 'f2');
      expect(result['url'], 'https://cdn.example.com/f2');
    });

    test('getFileInfo uses POST /api/file/info', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.info);
        expect(body, {'fileId': 'f3'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'f3',
            'name': 'doc.pdf',
            'size': 2048,
            'url': 'https://cdn.example.com/f3',
            'mimeType': 'application/pdf',
          }),
        );
      };

      final result = await api.getFileInfo('f3');
      expect(result.id, 'f3');
      expect(result.name, 'doc.pdf');
      expect(result.size, 2048);
      expect(result.mimeType, 'application/pdf');
    });

    test('deleteFile uses DELETE /api/file/delete', () async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, FileEndpoints.delete);
        expect(body, {'fileId': 'f4'});
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      await api.deleteFile(const FileDeleteRequest(fileId: 'f4'));
      expect(http.requests.last.$1, 'DELETE');
      expect(http.requests.last.$2, FileEndpoints.delete);
    });

    test('uploadAvatar propagates errors', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Upload failed');
      };

      expect(
        () => api.uploadAvatar(Uint8List(0), 'bad.png'),
        throwsA(isA<Exception>()),
      );
    });

    test('getFileInfo propagates errors', () async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Not found');
      };

      expect(
        () => api.getFileInfo('bad-id'),
        throwsA(isA<Exception>()),
      );
    });
  });
}
