import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('ApiResponse', () {
    test('fromJson creates ApiResponse with string data', () {
      final json = {
        'code': 200,
        'message': 'success',
        'data': 'hello',
        'timestamp': 1704067200000,
        'success': true,
      };
      final response = ApiResponse<String>.fromJson(
        json,
        (data) => data as String,
      );

      expect(response.code, 200);
      expect(response.message, 'success');
      expect(response.data, 'hello');
      expect(response.timestamp, 1704067200000);
      expect(response.success, isTrue);
    });

    test('fromJson creates ApiResponse with map data', () {
      final json = {
        'code': 200,
        'message': 'ok',
        'data': {'id': '1', 'name': 'test'},
      };
      final response = ApiResponse<Map<String, dynamic>>.fromJson(
        json,
        (data) => data as Map<String, dynamic>,
      );

      expect(response.code, 200);
      expect(response.data['id'], '1');
      expect(response.data['name'], 'test');
    });

    test('fromJson creates ApiResponse with list data', () {
      final json = {
        'code': 200,
        'message': 'ok',
        'data': [1, 2, 3],
      };
      final response = ApiResponse<List<int>>.fromJson(
        json,
        (data) => (data as List).cast<int>(),
      );

      expect(response.data, [1, 2, 3]);
    });

    test('fromJson handles null timestamp and success', () {
      final json = {
        'code': 400,
        'message': 'bad request',
        'data': null,
      };
      final response = ApiResponse<dynamic>.fromJson(
        json,
        (data) => data,
      );

      expect(response.code, 400);
      expect(response.data, isNull);
      expect(response.timestamp, isNull);
      expect(response.success, isNull);
    });

    test('fromJson creates error response', () {
      final json = {
        'code': 500,
        'message': 'Internal server error',
        'data': null,
        'success': false,
      };
      final response = ApiResponse<String?>.fromJson(
        json,
        (data) => data as String?,
      );

      expect(response.code, 500);
      expect(response.message, 'Internal server error');
      expect(response.success, isFalse);
    });

    test('equality works correctly', () {
      final r1 = ApiResponse<String>(
        code: 200,
        message: 'ok',
        data: 'test',
      );
      final r2 = ApiResponse<String>(
        code: 200,
        message: 'ok',
        data: 'test',
      );
      final r3 = ApiResponse<String>(
        code: 400,
        message: 'bad',
        data: 'test',
      );

      expect(r1, equals(r2));
      expect(r1, isNot(equals(r3)));
    });
  });

  group('PageRequest', () {
    test('fromJson creates PageRequest correctly', () {
      final json = {
        'page': 1,
        'size': 20,
        'sort': 'createTime',
        'order': 'desc',
      };
      final request = PageRequest.fromJson(json);

      expect(request.page, 1);
      expect(request.size, 20);
      expect(request.sort, 'createTime');
      expect(request.order, 'desc');
    });

    test('fromJson handles optional fields', () {
      final json = {
        'page': 0,
        'size': 10,
      };
      final request = PageRequest.fromJson(json);

      expect(request.page, 0);
      expect(request.size, 10);
      expect(request.sort, isNull);
      expect(request.order, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const request = PageRequest(
        page: 2,
        size: 50,
        sort: 'name',
        order: 'asc',
      );
      final json = request.toJson();
      final restored = PageRequest.fromJson(json);

      expect(restored, equals(request));
    });
  });

  group('PageResponse', () {
    test('fromJson creates PageResponse correctly', () {
      final json = {
        'content': ['item1', 'item2', 'item3'],
        'totalElements': 100,
        'totalPages': 5,
        'page': 0,
        'size': 20,
        'first': true,
        'last': false,
      };
      final response = PageResponse<String>.fromJson(
        json,
        (data) => data as String,
      );

      expect(response.content, ['item1', 'item2', 'item3']);
      expect(response.totalElements, 100);
      expect(response.totalPages, 5);
      expect(response.page, 0);
      expect(response.size, 20);
      expect(response.first, isTrue);
      expect(response.last, isFalse);
    });

    test('fromJson creates empty page response', () {
      final json = {
        'content': [],
        'totalElements': 0,
        'totalPages': 0,
        'page': 0,
        'size': 20,
        'first': true,
        'last': true,
      };
      final response = PageResponse<String>.fromJson(
        json,
        (data) => data as String,
      );

      expect(response.content, isEmpty);
      expect(response.totalElements, 0);
      expect(response.first, isTrue);
      expect(response.last, isTrue);
    });

    test('fromJson with complex data types', () {
      final json = {
        'content': [
          {'id': '1', 'name': 'Alice'},
          {'id': '2', 'name': 'Bob'},
        ],
        'totalElements': 2,
        'totalPages': 1,
        'page': 0,
        'size': 20,
        'first': true,
        'last': true,
      };
      final response = PageResponse<Map<String, dynamic>>.fromJson(
        json,
        (data) => data as Map<String, dynamic>,
      );

      expect(response.content.length, 2);
      expect(response.content[0]['name'], 'Alice');
      expect(response.content[1]['name'], 'Bob');
    });
  });

  group('FileUploadResponse', () {
    test('fromJson creates FileUploadResponse correctly', () {
      final json = {
        'url': 'https://example.com/file.pdf',
        'thumbnailUrl': 'https://example.com/thumb.png',
        'size': 2048,
        'originalFilename': 'document.pdf',
        'filename': 'abc123.pdf',
        'contentType': 'application/pdf',
        'category': 'document',
        'uploadDate': '2024-01-01',
        'uploadTime': 1704067200000,
        'uploaderId': 'u1',
        'fileName': 'abc123.pdf',
        'fileType': 'pdf',
      };
      final response = FileUploadResponse.fromJson(json);

      expect(response.url, 'https://example.com/file.pdf');
      expect(response.thumbnailUrl, 'https://example.com/thumb.png');
      expect(response.size, 2048);
      expect(response.originalFilename, 'document.pdf');
      expect(response.filename, 'abc123.pdf');
      expect(response.contentType, 'application/pdf');
      expect(response.category, 'document');
      expect(response.uploadDate, '2024-01-01');
      expect(response.uploadTime, 1704067200000);
      expect(response.uploaderId, 'u1');
    });

    test('fromJson handles minimal fields', () {
      final json = {
        'url': 'https://example.com/file.txt',
      };
      final response = FileUploadResponse.fromJson(json);

      expect(response.url, 'https://example.com/file.txt');
      expect(response.thumbnailUrl, isNull);
      expect(response.size, isNull);
      expect(response.originalFilename, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const response = FileUploadResponse(
        url: 'https://example.com/file.pdf',
        size: 2048,
        originalFilename: 'doc.pdf',
        contentType: 'application/pdf',
      );
      final json = response.toJson();
      final restored = FileUploadResponse.fromJson(json);

      expect(restored, equals(response));
    });
  });
}
