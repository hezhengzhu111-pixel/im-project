import 'dart:async';
import 'package:dio/dio.dart';
import 'package:im_core/core.dart';
import '../core/logging/app_logger.dart';

class WebHttpClient implements HttpClientPort {
  WebHttpClient({
    required String baseUrl,
    required SecureStoragePort secureStorage,
  }) : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          extra: const {'withCredentials': true},
        )) {
    _dio.interceptors.addAll([
      _AuthInterceptor(secureStorage, _dio),
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
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      path,
      queryParameters: queryParameters,
    );
    return _parseResponse(response, fromJson);
  }

  ApiResponse<T> _parseResponse<T>(
    Response<Map<String, dynamic>> response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final data = response.data!;
    final rawData = data['data'];
    dynamic parsedData;
    if (rawData is Map<String, dynamic>) {
      parsedData = fromJson(rawData);
    } else if (rawData is List) {
      parsedData = fromJson({'items': rawData});
    } else {
      parsedData = rawData;
    }
    return ApiResponse<T>(
      code: data['code'] as int,
      message: data['message'] as String,
      data: parsedData as T,
      timestamp: data['timestamp'] as int?,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._secureStorage, this._dio);
  final SecureStoragePort _secureStorage;
  final Dio _dio;
  bool _isRefreshing = false;
  final List<Completer<void>> _refreshQueue = [];

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // 跳过 refresh token 请求本身的认证头
    if (options.path == AuthEndpoints.refresh) {
      handler.next(options);
      return;
    }

    final token = await _secureStorage.read('access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // 避免 refresh token 请求本身触发无限循环
      if (err.requestOptions.path == AuthEndpoints.refresh) {
        handler.next(err);
        return;
      }

      // 如果正在刷新，加入队列等待
      if (_isRefreshing) {
        final completer = Completer<void>();
        _refreshQueue.add(completer);
        try {
          await completer.future;
        } catch (_) {
          handler.next(err);
          return;
        }

        // 刷新完成后重试原请求
        try {
          final token = await _secureStorage.read('access_token');
          if (token != null) {
            err.requestOptions.headers['Authorization'] = 'Bearer $token';
          } else {
            err.requestOptions.headers.remove('Authorization');
          }
          final response = await _dio.fetch(err.requestOptions);
          handler.resolve(response);
          return;
        } catch (e) {
          handler.next(err);
          return;
        }
      }

      // 开始刷新 token
      _isRefreshing = true;
      try {
        final refreshToken = await _secureStorage.read('refresh_token');
        if (refreshToken == null || refreshToken.isEmpty) {
          throw Exception('No refresh token');
        }

        // 调用 refresh API
        final response = await _dio.post<Map<String, dynamic>>(
          AuthEndpoints.refresh,
          data: {'refreshToken': refreshToken},
        );

        final data = response.data;
        if (data == null) {
          throw Exception('Invalid refresh response');
        }

        // 保存新 token
        final payload = data['data'] is Map<String, dynamic>
            ? data['data'] as Map<String, dynamic>
            : data;
        final newToken = _stringValue(
          payload['accessToken'] ?? payload['access_token'] ?? payload['token'],
        );
        final newRefreshToken = _stringValue(
          payload['refreshToken'] ?? payload['refresh_token'],
        );

        if (newToken != null) {
          await _secureStorage.write('access_token', newToken);
        } else {
          await _secureStorage.delete('access_token');
        }
        if (newRefreshToken != null) {
          await _secureStorage.write('refresh_token', newRefreshToken);
        }

        // 通知等待队列
        for (final completer in _refreshQueue) {
          completer.complete();
        }
        _refreshQueue.clear();

        // 重试原请求
        if (newToken != null) {
          err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        } else {
          err.requestOptions.headers.remove('Authorization');
        }
        final retryResponse = await _dio.fetch(err.requestOptions);
        handler.resolve(retryResponse);
      } catch (e, st) {
        AppLogger.instance.error('Token refresh failed', e, st, 'auth');
        // 清理 token
        await _secureStorage.delete('access_token');
        await _secureStorage.delete('refresh_token');

        // 通知等待队列
        for (final completer in _refreshQueue) {
          completer.completeError(e, st);
        }
        _refreshQueue.clear();

        // 抛出异常，让上层处理跳转登录
        handler.next(err);
      } finally {
        _isRefreshing = false;
      }
    } else {
      handler.next(err);
    }
  }

  String? _stringValue(Object? value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty || text == 'null' ? null : text;
  }
}
