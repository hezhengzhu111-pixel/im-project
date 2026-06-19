import 'package:test/test.dart';
import 'package:im_core/core.dart';

/// In-memory fake that records calls for verifying [HttpClientPort] contracts.
class _FakeHttpClientPort implements HttpClientPort {
  final List<(String method, String path, dynamic body, Map<String, dynamic>? query)> requests = [];

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('GET', path, null, queryParameters));
    return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({'items': <dynamic>[]}));
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('POST', path, body, null));
    return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('PUT', path, body, null));
    return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('DELETE', path, body, queryParameters));
    return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
  }
}

void main() {
  group('HttpClientPort contract', () {
    late _FakeHttpClientPort client;

    setUp(() => client = _FakeHttpClientPort());

    test('get records method, path, and query parameters', () async {
      await client.get<Map<String, dynamic>>(
        '/api/test',
        queryParameters: {'page': 1},
        fromJson: (json) => json,
      );
      expect(client.requests, hasLength(1));
      expect(client.requests.first.$1, 'GET');
      expect(client.requests.first.$2, '/api/test');
      expect(client.requests.first.$4, {'page': 1});
    });

    test('post records method, path, and body', () async {
      await client.post<Map<String, dynamic>>(
        '/api/test',
        body: {'name': 'value'},
        fromJson: (json) => json,
      );
      expect(client.requests.last.$1, 'POST');
      expect(client.requests.last.$2, '/api/test');
      expect(client.requests.last.$3, {'name': 'value'});
    });

    test('put records method, path, and body', () async {
      await client.put<Map<String, dynamic>>(
        '/api/test/1',
        body: {'name': 'updated'},
        fromJson: (json) => json,
      );
      expect(client.requests.last.$1, 'PUT');
      expect(client.requests.last.$2, '/api/test/1');
      expect(client.requests.last.$3, {'name': 'updated'});
    });

    test('delete records method, path, body, and query parameters', () async {
      await client.delete<Map<String, dynamic>>(
        '/api/test/1',
        body: {'reason': 'cleanup'},
        queryParameters: {'force': true},
        fromJson: (json) => json,
      );
      expect(client.requests.last.$1, 'DELETE');
      expect(client.requests.last.$2, '/api/test/1');
      expect(client.requests.last.$3, {'reason': 'cleanup'});
      expect(client.requests.last.$4, {'force': true});
    });

    test('ApiResponse carries code, message, and data', () async {
      final response = await client.get<Map<String, dynamic>>(
        '/api/test',
        fromJson: (json) => json,
      );
      expect(response.code, 200);
      expect(response.message, 'ok');
      expect(response.data, isA<Map<String, dynamic>>());
    });
  });
}
