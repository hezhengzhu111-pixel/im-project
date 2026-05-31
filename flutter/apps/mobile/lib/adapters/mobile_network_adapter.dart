import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

/// Mobile HTTP client adapter using Dio with token-based auth.
///
/// Unlike the web adapter which relies on cookies, mobile stores JWT
/// tokens in secure storage and attaches them as Bearer headers.
class MobileNetworkService implements HttpClientPort {
  MobileNetworkService({
    required String baseUrl,
    FlutterSecureStorage? secureStorage,
  })  : _secureStorage = secureStorage ?? const FlutterSecureStorage(),
        _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        )) {
    _dio.interceptors.addAll([
      _AuthInterceptor(_dio, _secureStorage),
      LogInterceptor(requestBody: true, responseBody: true),
    ]);
  }

  final Dio _dio;
  final FlutterSecureStorage _secureStorage;

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

    // Reject non-success responses (match web httpClient behavior).
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

/// Interceptor that attaches the Bearer token from secure storage and
/// handles 401 refresh flow.
class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._dio, this._secureStorage);
  final Dio _dio;
  final FlutterSecureStorage _secureStorage;
  bool _isRefreshing = false;
  final List<Completer<void>> _refreshQueue = [];

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _secureStorage.read(key: 'access_token');
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
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
          final newToken = await _secureStorage.read(key: 'access_token');
          if (newToken != null) {
            err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
          }
          final response = await _dio.fetch<Map<String, dynamic>>(
            err.requestOptions,
          );
          handler.resolve(response);
          return;
        } catch (e) {
          handler.next(err);
          return;
        }
      }

      _isRefreshing = true;
      try {
        final refreshToken = await _secureStorage.read(key: 'refresh_token');
        if (refreshToken == null || refreshToken.isEmpty) {
          throw Exception('No refresh token available');
        }

        final response = await _dio.post<Map<String, dynamic>>(
          AuthEndpoints.refresh,
          data: <String, dynamic>{},
          options: Options(
            headers: {'Authorization': 'Bearer $refreshToken'},
          ),
        );

        final data = response.data;
        if (data != null && data['data'] is Map<String, dynamic>) {
          final tokenData = data['data'] as Map<String, dynamic>;
          final newAccessToken = tokenData['accessToken'] as String?;
          final newRefreshToken = tokenData['refreshToken'] as String?;
          if (newAccessToken != null) {
            await _secureStorage.write(
              key: 'access_token',
              value: newAccessToken,
            );
          }
          if (newRefreshToken != null) {
            await _secureStorage.write(
              key: 'refresh_token',
              value: newRefreshToken,
            );
          }
        }

        for (final completer in _refreshQueue) {
          completer.complete();
        }
        _refreshQueue.clear();

        final newToken = await _secureStorage.read(key: 'access_token');
        if (newToken != null) {
          err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        }
        final retryResponse = await _dio.fetch<Map<String, dynamic>>(
          err.requestOptions,
        );
        handler.resolve(retryResponse);
      } catch (e, st) {
        for (final completer in _refreshQueue) {
          completer.completeError(e, st);
        }
        _refreshQueue.clear();
        // Clear invalid tokens on refresh failure.
        await _secureStorage.delete(key: 'access_token');
        await _secureStorage.delete(key: 'refresh_token');
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
