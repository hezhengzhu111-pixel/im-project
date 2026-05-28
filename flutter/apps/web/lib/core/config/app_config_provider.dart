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
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:8082',
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
