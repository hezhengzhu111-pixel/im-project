import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/adapters/web_http_adapter.dart';

class _FakeResponse {
  _FakeResponse(this.body, this.statusCode, {this.contentType = 'application/json'});
  final String body;
  final int statusCode;
  final String contentType;
}

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.responses);
  final Map<String, _FakeResponse> responses;
  final List<String> requestedPaths = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future? cancelFuture,
  ) async {
    requestedPaths.add(options.path);
    final response = responses[options.path];
    if (response == null) {
      return ResponseBody.fromString(
        jsonEncode({'code': 404, 'message': 'not found'}),
        404,
        headers: {'content-type': ['application/json']},
      );
    }
    return ResponseBody.fromString(
      response.body,
      response.statusCode,
      headers: {'content-type': [response.contentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('WebHttpClient robust response parsing', () {
    test('parses a standard success envelope', () async {
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse(
          jsonEncode({
            'code': 200,
            'message': 'ok',
            'data': {'id': '1', 'username': 'alice'},
          }),
          200,
        ),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      final response = await client.get<Map<String, dynamic>>(
        '/api/user/profile',
        fromJson: (json) => json,
      );

      expect(response.code, 200);
      expect(response.data['username'], 'alice');
    });

    test('throws a readable error for an empty response body', () async {
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse('', 204, contentType: 'text/plain'),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      expect(
        () => client.get<Map<String, dynamic>>(
          '/api/user/profile',
          fromJson: (json) => json,
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.badResponse,
          ),
        ),
      );
    });

    test('throws a readable error for an HTML error page', () async {
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse(
          '<html><body>Gateway Timeout</body></html>',
          200,
          contentType: 'text/html',
        ),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      expect(
        () => client.get<Map<String, dynamic>>(
          '/api/user/profile',
          fromJson: (json) => json,
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.message,
            'message',
            contains('HTML error page'),
          ),
        ),
      );
    });

    test('throws a readable error for a non-JSON response', () async {
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse('not valid json', 200, contentType: 'text/plain'),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      expect(
        () => client.get<Map<String, dynamic>>(
          '/api/user/profile',
          fromJson: (json) => json,
        ),
        throwsA(isA<DioException>()),
      );
    });

    test('throws when the envelope reports a non-success code', () async {
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse(
          jsonEncode({'code': 500, 'message': 'server boom', 'success': false}),
          200,
        ),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      expect(
        () => client.get<Map<String, dynamic>>(
          '/api/user/profile',
          fromJson: (json) => json,
        ),
        throwsA(
          isA<DioException>().having(
            (e) => e.message,
            'message',
            contains('server boom'),
          ),
        ),
      );
    });

    test('allows null data for void responses', () async {
      final adapter = _FakeAdapter({
        '/api/user/logout': _FakeResponse(
          jsonEncode({'code': 200, 'message': 'ok', 'data': null}),
          200,
        ),
      });
      final client = WebHttpClient(baseUrl: '', adapter: adapter);

      final response = await client.post<void>(
        '/api/user/logout',
        fromJson: (_) {},
      );

      expect(response.code, 200);
    });
  });

  group('WebHttpClient auth interceptor', () {
    test('calls onAuthFailure when token refresh returns 401', () async {
      var failureCount = 0;
      final adapter = _FakeAdapter({
        '/api/user/profile': _FakeResponse(
          jsonEncode({'code': 401, 'message': 'Unauthorized'}),
          401,
        ),
        '/api/auth/refresh': _FakeResponse(
          jsonEncode({'code': 401, 'message': 'Session expired'}),
          401,
        ),
      });
      final client = WebHttpClient(
        baseUrl: '',
        adapter: adapter,
        onAuthFailure: () => failureCount++,
      );

      await expectLater(
        () => client.get<Map<String, dynamic>>(
          '/api/user/profile',
          fromJson: (json) => json,
        ),
        throwsA(isA<DioException>()),
      );

      expect(failureCount, 1);
      expect(adapter.requestedPaths, contains('/api/auth/refresh'));
    });

    test('does not call onAuthFailure for login 401', () async {
      var failureCount = 0;
      final adapter = _FakeAdapter({
        '/api/user/login': _FakeResponse(
          jsonEncode({'code': 401, 'message': 'Bad credentials'}),
          401,
        ),
      });
      final client = WebHttpClient(
        baseUrl: '',
        adapter: adapter,
        onAuthFailure: () => failureCount++,
      );

      await expectLater(
        () => client.post<Map<String, dynamic>>(
          '/api/user/login',
          body: {'username': 'x', 'password': 'y'},
          fromJson: (json) => json,
        ),
        throwsA(isA<DioException>()),
      );

      expect(failureCount, 0);
    });
  });
}
