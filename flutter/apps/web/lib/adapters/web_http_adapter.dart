import 'dart:async';
import 'package:dio/dio.dart';
import 'package:im_core/core.dart';
import '../core/logging/app_logger.dart';

class WebHttpClient implements HttpClientPort {
  WebHttpClient({
    required String baseUrl,
  }) : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          extra: const {'withCredentials': true},
        )) {
    _dio.interceptors.addAll([
      _AuthInterceptor(_dio),
      LogInterceptor(requestBody: true, responseBody: true),
    ]);
  }

  final Dio _dio;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      path,
      queryParameters: queryParameters,
    );
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(path, data: body);
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.put<Map<String, dynamic>>(path, data: body);
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      path,
      data: body,
      queryParameters: queryParameters,
    );
    return _parseResponse(response, fromJson);
  }

  ApiResponse<T> _parseResponse<T>(
    Response<Map<String, dynamic>> response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final data = response.data!;
    final code = data['code'] as int? ?? 0;
    final message = data['message'] as String? ?? '';
    final success = data['success'] as bool?;

    // Reject non-success responses (match Vue httpClient behavior).
    if (success == false || (code != 0 && code != 200)) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
        message:
            message.isNotEmpty ? message : 'Request failed with code $code',
      );
    }

    final rawData = data['data'];
    dynamic parsedData;
    if (rawData is Map<String, dynamic>) {
      parsedData = fromJson(rawData);
    } else if (rawData is List) {
      parsedData = fromJson({'items': rawData});
    } else if (rawData == null) {
      // Server returned null data — pass through as null instead of crashing.
      parsedData = null;
    } else {
      parsedData = rawData;
    }
    return ApiResponse<T>(
      code: code,
      message: message,
      data: parsedData as T,
      timestamp: data['timestamp'] as int?,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._dio);
  final Dio _dio;
  bool _isRefreshing = false;
  final List<Completer<void>> _refreshQueue = [];

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // Cookies are the only browser auth transport. Drop any stale local header.
    options.headers.remove('Authorization');
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // Avoid recursive refresh for auth endpoints.
      if (_shouldSkipRefresh(err.requestOptions.path)) {
        handler.next(err);
        return;
      }

      // Serialize concurrent refresh attempts.
      if (_isRefreshing) {
        final completer = Completer<void>();
        _refreshQueue.add(completer);
        try {
          await completer.future;
        } catch (_) {
          handler.next(err);
          return;
        }

        // Retry the original request after the shared refresh completes.
        try {
          err.requestOptions.headers.remove('Authorization');
          final response = await _dio.fetch(err.requestOptions);
          handler.resolve(response);
          return;
        } catch (e) {
          handler.next(err);
          return;
        }
      }

      _isRefreshing = true;
      try {
        await _dio.post<Map<String, dynamic>>(
          AuthEndpoints.refresh,
          data: const <String, dynamic>{},
        );

        for (final completer in _refreshQueue) {
          completer.complete();
        }
        _refreshQueue.clear();

        err.requestOptions.headers.remove('Authorization');
        final retryResponse = await _dio.fetch(err.requestOptions);
        handler.resolve(retryResponse);
      } catch (e, st) {
        AppLogger.instance.error('Token refresh failed', e, st, 'auth');
        for (final completer in _refreshQueue) {
          completer.completeError(e, st);
        }
        _refreshQueue.clear();

        handler.next(err);
      } finally {
        _isRefreshing = false;
      }
    } else {
      handler.next(err);
    }
  }

  bool _shouldSkipRefresh(String path) {
    return path == AuthEndpoints.refresh ||
        path == AuthEndpoints.parse ||
        path == UserEndpoints.login ||
        path == UserEndpoints.register ||
        path == UserEndpoints.logout;
  }
}
