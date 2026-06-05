import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:im_core/core.dart';
import '../core/logging/app_logger.dart';

/// Paths whose request/response bodies must never be logged.
const _sensitivePaths = <String>{
  UserEndpoints.login,
  UserEndpoints.register,
  AuthEndpoints.refresh,
  AuthEndpoints.parse,
  AuthEndpoints.wsTicket,
  UserEndpoints.logout,
};

/// Keys whose values must be redacted in log output.
/// All keys are lowercase; comparison uses key.toLowerCase().
const _sensitiveKeys = <String>{
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'refresh_token',
  'ticket',
  'authorization',
  'cookie',
  'set-cookie',
};

/// Whether the current runtime is development.
bool _isDevelopment() {
  const env = String.fromEnvironment('APP_ENV', defaultValue: '');
  return env.isEmpty || env == 'dev' || env == 'development' || env == 'test';
}

/// Recursively redact sensitive values in a JSON-like map.
Map<String, dynamic> _redactSensitive(Map<String, dynamic> json) {
  final redacted = <String, dynamic>{};
  for (final entry in json.entries) {
    final key = entry.key;
    final value = entry.value;
    if (_sensitiveKeys.contains(key.toLowerCase())) {
      redacted[key] = '***REDACTED***';
    } else if (value is Map<String, dynamic>) {
      redacted[key] = _redactSensitive(value);
    } else if (value is List) {
      redacted[key] = _redactList(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/// Recursively redact sensitive values in a list that may contain maps.
List<dynamic> _redactList(List<dynamic> list) {
  return list.map((item) {
    if (item is Map<String, dynamic>) {
      return _redactSensitive(item);
    } else if (item is List) {
      return _redactList(item);
    }
    return item;
  }).toList();
}

class WebHttpClient implements HttpClientPort {
  WebHttpClient({
    required String baseUrl,
  }) : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          extra: const {'withCredentials': true},
        )) {
    _dio.interceptors.addAll([
      _AuthInterceptor(_dio),
      _SensitiveLogInterceptor(),
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

/// Custom log interceptor that sanitizes sensitive data.
///
/// - Production: never logs request/response bodies.
/// - Development: logs bodies for non-sensitive paths, with sensitive keys redacted.
/// - Always logs method, path, status code, and error type for debugging.
class _SensitiveLogInterceptor extends Interceptor {
  final _isDev = _isDevelopment();

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final path = options.uri.path;
    final isSensitive = _sensitivePaths.contains(path);
    final shouldLogBody = _isDev && !isSensitive;

    AppLogger.instance.debug(
      '[http] ${options.method} $path'
      '${shouldLogBody && options.data != null ? ' body=${_redactBody(options.data)}' : ''}',
    );
    handler.next(options);
  }

  @override
  void onResponse(
      Response<dynamic> response, ResponseInterceptorHandler handler) {
    final path = response.requestOptions.uri.path;
    final statusCode = response.statusCode;
    final isSensitive = _sensitivePaths.contains(path);
    final shouldLogBody = _isDev && !isSensitive;

    AppLogger.instance.debug(
      '[http] $statusCode ${response.requestOptions.method} $path'
      '${shouldLogBody && response.data != null ? ' body=${_redactBody(response.data)}' : ''}',
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final path = err.requestOptions.uri.path;
    final statusCode = err.response?.statusCode;
    AppLogger.instance.warn(
      '[http] ERROR ${statusCode ?? 'N/A'} ${err.requestOptions.method} $path'
      ' type=${err.type.name}',
    );
    handler.next(err);
  }

  dynamic _redactBody(dynamic body) {
    if (body is Map<String, dynamic>) {
      return _redactSensitive(body);
    }
    if (body is String) {
      // Attempt to parse as JSON for redaction
      try {
        final decoded = Map<String, dynamic>.from(
            const JsonDecoder().convert(body) as Map);
        return _redactSensitive(decoded);
      } catch (_) {
        return '[string body omitted]';
      }
    }
    return '[non-json body omitted]';
  }
}
