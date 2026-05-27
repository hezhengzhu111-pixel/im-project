import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

class WebHttpClient implements HttpClientPort {
  WebHttpClient({
    required String baseUrl,
    required SecureStoragePort secureStorage,
  }) : _dio = Dio(BaseOptions(baseUrl: baseUrl)) {
    _dio.interceptors.addAll([
      _AuthInterceptor(secureStorage),
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
    final response =
        await _dio.post<Map<String, dynamic>>(path, data: body);
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response =
        await _dio.put<Map<String, dynamic>>(path, data: body);
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
    return ApiResponse<T>(
      code: data['code'] as int,
      message: data['message'] as String,
      data: fromJson(data['data'] as Map<String, dynamic>),
      timestamp: data['timestamp'] as int?,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._secureStorage);
  final SecureStoragePort _secureStorage;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _secureStorage.read('access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
}
