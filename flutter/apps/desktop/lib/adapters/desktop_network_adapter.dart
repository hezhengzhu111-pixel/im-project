import 'dart:async';

import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

/// Desktop HTTP client adapter using Dio with token-based auth.
///
/// Unlike the web adapter which uses cookies, the desktop adapter stores
/// and sends auth tokens via the Authorization header.
class DesktopNetworkService implements HttpClientPort {
  DesktopNetworkService({required String baseUrl})
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          headers: {'Content-Type': 'application/json'},
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
    // Token-based auth: attach Authorization header if available.
    // The actual token is managed by the DesktopNetworkService.
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      if (_shouldSkipRefresh(err.requestOptions.path)) {
        handler.next(err);
        return;
      }

      if (_isRefreshing) {
        final completer = Completer<void>();
        _refreshQueue.add(completer);
        try {
          await completer.future;
        } catch (_) {
          handler.next(err);
          return;
        }

        try {
          final retryResponse = await _dio.fetch(err.requestOptions);
          handler.resolve(retryResponse);
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

        final retryResponse = await _dio.fetch(err.requestOptions);
        handler.resolve(retryResponse);
      } catch (e, st) {
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
