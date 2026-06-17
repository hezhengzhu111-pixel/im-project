import 'package:im_core/core.dart';

/// Fake HttpClientPort for unit tests that records calls and delegates to
/// configurable callbacks.
class FakeHttpClientPort implements HttpClientPort {
  final List<(String method, String path, dynamic body)> requests = [];

  Future<ApiResponse<T>> Function<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  })? onGet;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPost;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPut;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  })? onDelete;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('GET', path, null));
    if (onGet != null) {
      return onGet!(path, queryParameters: queryParameters, fromJson: fromJson);
    }
    throw UnimplementedError('No onGet callback configured');
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('POST', path, body));
    if (onPost != null) {
      return onPost!(path, body: body, fromJson: fromJson);
    }
    throw UnimplementedError('No onPost callback configured');
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('PUT', path, body));
    if (onPut != null) {
      return onPut!(path, body: body, fromJson: fromJson);
    }
    throw UnimplementedError('No onPut callback configured');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('DELETE', path, body));
    if (onDelete != null) {
      return onDelete!(
        path,
        body: body,
        queryParameters: queryParameters,
        fromJson: fromJson,
      );
    }
    throw UnimplementedError('No onDelete callback configured');
  }
}

/// Fake AnalyticsPort that discards all events.
class FakeAnalyticsPort implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
