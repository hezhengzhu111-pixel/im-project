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
    this.onAuthFailure,
    HttpClientAdapter? adapter,
  }) : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
          sendTimeout: const Duration(seconds: 30),
          extra: const {'withCredentials': true},
        )) {
    if (adapter != null) {
      _dio.httpClientAdapter = adapter;
    }
    _dio.interceptors.addAll([
      _AuthInterceptor(_dio, onAuthFailure: onAuthFailure),
      _SensitiveLogInterceptor(),
    ]);
  }

  final Dio _dio;

  /// Called when the auth interceptor detects that the session is irrecoverable
  /// (e.g. the refresh endpoint returns 401). The web app wires this to the
  /// global auth state so the UI does not stay "authenticated" while every API
  /// call fails.
  void Function()? onAuthFailure;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
      );
      return _parseResponse(response, fromJson);
    } on DioException {
      rethrow;
    } catch (e, st) {
      throw _wrapUnexpectedError(e, st);
    }
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    try {
      final response = await _dio.post<dynamic>(path, data: body);
      return _parseResponse(response, fromJson);
    } on DioException {
      rethrow;
    } catch (e, st) {
      throw _wrapUnexpectedError(e, st);
    }
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    try {
      final response = await _dio.put<dynamic>(path, data: body);
      return _parseResponse(response, fromJson);
    } on DioException {
      rethrow;
    } catch (e, st) {
      throw _wrapUnexpectedError(e, st);
    }
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    try {
      final response = await _dio.delete<dynamic>(
        path,
        data: body,
        queryParameters: queryParameters,
      );
      return _parseResponse(response, fromJson);
    } on DioException {
      rethrow;
    } catch (e, st) {
      throw _wrapUnexpectedError(e, st);
    }
  }

  ApiResponse<T> _parseResponse<T>(
    Response<dynamic> response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final rawBody = response.data;

    if (rawBody == null || (rawBody is String && rawBody.trim().isEmpty)) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
        message: 'Empty response body',
      );
    }

    final Map<String, dynamic> data;
    if (rawBody is Map<String, dynamic>) {
      data = rawBody;
    } else if (rawBody is String) {
      final trimmed = rawBody.trim();
      if (trimmed.startsWith('<')) {
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          type: DioExceptionType.badResponse,
          message: 'Server returned an HTML error page',
        );
      }
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) {
          data = decoded;
        } else {
          throw DioException(
            requestOptions: response.requestOptions,
            response: response,
            type: DioExceptionType.badResponse,
            message: 'Response body is not a JSON object',
          );
        }
      } catch (e) {
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          type: DioExceptionType.badResponse,
          message: 'Invalid JSON response: $e',
        );
      }
    } else {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
        message: 'Unexpected response body type: ${rawBody.runtimeType}',
      );
    }

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
      // Callers that require non-null data (e.g. login) will get a cast error
      // which is surfaced as a bad-response exception by the public wrappers.
      parsedData = null;
    } else {
      parsedData = rawData;
    }

    try {
      return ApiResponse<T>(
        code: code,
        message: message,
        data: parsedData as T,
        timestamp: data['timestamp'] as int?,
      );
    } on TypeError catch (e) {
      throw DioException(
        requestOptions: response.requestOptions,
        response: response,
        type: DioExceptionType.badResponse,
        message: 'Response data incompatible with expected type: $e',
      );
    }
  }

  DioException _wrapUnexpectedError(Object error, StackTrace stackTrace) {
    return DioException(
      requestOptions: RequestOptions(path: ''),
      type: DioExceptionType.unknown,
      error: error,
      message: 'Unexpected HTTP error: $error',
    );
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(
    this._dio, {
    this.onAuthFailure,
  });

  final Dio _dio;
  final void Function()? onAuthFailure;
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

        // The session is no longer valid; notify the app so it can move the
        // auth state out of authenticated instead of leaving the user stuck.
        try {
          onAuthFailure?.call();
        } catch (callbackError, callbackSt) {
          AppLogger.instance.error(
            'Auth failure callback threw',
            callbackError,
            callbackSt,
            'auth',
          );
        }

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
    final typeLabel = err.type.name;
    final message = switch (err.type) {
      DioExceptionType.connectionTimeout =>
        'Connection timed out',
      DioExceptionType.receiveTimeout =>
        'Receive timed out',
      DioExceptionType.sendTimeout =>
        'Send timed out',
      DioExceptionType.connectionError =>
        'Network connection error',
      DioExceptionType.cancel =>
        'Request cancelled',
      DioExceptionType.badResponse =>
        'Bad response (${statusCode ?? 'N/A'})',
      DioExceptionType.badCertificate =>
        'Bad certificate',
      DioExceptionType.unknown =>
        'Unknown error',
    };
    AppLogger.instance.warn(
      '[http] ERROR ${statusCode ?? 'N/A'} ${err.requestOptions.method} $path'
      ' type=$typeLabel: $message',
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
        final decoded =
            Map<String, dynamic>.from(const JsonDecoder().convert(body) as Map);
        return _redactSensitive(decoded);
      } catch (_) {
        return '[string body omitted]';
      }
    }
    return '[non-json body omitted]';
  }
}
