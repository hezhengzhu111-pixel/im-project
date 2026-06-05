import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    this.appEnv = 'production',
    this.analyticsEnabled = false,
    this.errorReporterEnabled = false,
    this.pushEnabled = false,
    this.paymentEnabled = false,
    this.mapEnabled = false,
    this.filePreviewEnabled = false,
  });

  final String apiBaseUrl;
  final String wsBaseUrl;
  final String appEnv;
  final bool analyticsEnabled;
  final bool errorReporterEnabled;
  final bool pushEnabled;
  final bool paymentEnabled;
  final bool mapEnabled;
  final bool filePreviewEnabled;

  bool get isDevelopment => appEnv == 'development';
  bool get isProduction => appEnv == 'production';
}

final appConfigProvider = Provider<AppConfig>((ref) {
  // 使用 127.0.0.1 而非 localhost，避免 wslrelay.exe 在 IPv6 上拦截请求
  // （wslrelay 将 localhost:8082 转发到 WSL2，但 Docker 容器在 Docker Desktop 网络中）
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8082',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://127.0.0.1:8082',
  );
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  return AppConfig(
    apiBaseUrl: apiBase,
    wsBaseUrl: wsBase,
    appEnv: env,
    analyticsEnabled: const bool.fromEnvironment('ANALYTICS_ENABLED'),
    errorReporterEnabled: const bool.fromEnvironment('ERROR_REPORTER_ENABLED'),
    pushEnabled: const bool.fromEnvironment('PUSH_ENABLED'),
    paymentEnabled: const bool.fromEnvironment('PAYMENT_ENABLED'),
    mapEnabled: const bool.fromEnvironment('MAP_ENABLED'),
    filePreviewEnabled: const bool.fromEnvironment('FILE_PREVIEW_ENABLED'),
  );
});
