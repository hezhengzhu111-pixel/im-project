import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';

import '../config/app_config.dart';
import 'storage_service.dart';

class HttpClient {
  HttpClient({required this.storage}) {
    dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: AppConfig.requestTimeout,
        receiveTimeout: AppConfig.requestTimeout,
        contentType: 'application/json;charset=UTF-8',
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = storage.token;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          options.headers['X-Gateway-Route'] = 'true';
          options.headers['X-Trace-Id'] = const Uuid().v4();
          if (options.method.toUpperCase() == 'GET') {
            options.queryParameters['_t'] = DateTime.now().millisecondsSinceEpoch;
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final refreshed = await _tryRefresh(error);
          if (refreshed) {
            final retry = await _retry(error.requestOptions);
            handler.resolve(retry);
            return;
          }
          handler.next(error);
        },
      ),
    );
  }

  late final Dio dio;
  final StorageService storage;
  Completer<bool>? _refreshing;

  bool _skipRefresh(String? path) {
    if (path == null) return false;
    return path.contains('/auth/refresh') ||
        path.contains('/user/login') ||
        path.contains('/user/register') ||
        path.contains('/user/logout');
  }

  Future<bool> _tryRefresh(DioException error) async {
    final statusCode = error.response?.statusCode;
    final bodyCode = int.tryParse('${error.response?.data['code'] ?? ''}');
    if ((statusCode != 401 && bodyCode != 401) || _skipRefresh(error.requestOptions.path)) {
      return false;
    }
    if (_refreshing != null) {
      return _refreshing!.future;
    }
    final refreshToken = storage.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      return false;
    }
    _refreshing = Completer<bool>();
    try {
      final response = await Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: AppConfig.requestTimeout,
          receiveTimeout: AppConfig.requestTimeout,
        ),
      ).post(
        '/auth/refresh',
        data: jsonEncode({'refreshToken': refreshToken}),
        options: Options(
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Gateway-Route': 'true',
            'X-Trace-Id': const Uuid().v4(),
          },
        ),
      );
      final data = response.data as Map<String, dynamic>;
      final ok = data['code'] == 200 && data['data'] != null;
      if (!ok) {
        _refreshing?.complete(false);
        return false;
      }
      final token = data['data']['accessToken']?.toString();
      final nextRefresh = data['data']['refreshToken']?.toString() ?? refreshToken;
      if (token == null || token.isEmpty) {
        _refreshing?.complete(false);
        return false;
      }
      await storage.updateTokens(token: token, refreshToken: nextRefresh);
      _refreshing?.complete(true);
      return true;
    } catch (_) {
      _refreshing?.complete(false);
      return false;
    } finally {
      _refreshing = null;
    }
  }

  Future<Response<dynamic>> _retry(RequestOptions options) async {
    final headers = Map<String, dynamic>.from(options.headers);
    final token = storage.token;
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return dio.fetch<dynamic>(
      options.copyWith(
        headers: headers,
      ),
    );
  }
}
