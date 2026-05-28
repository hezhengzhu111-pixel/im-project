import 'package:flutter_riverpod/flutter_riverpod.dart';

class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    this.appEnv = 'production',
  });

  final String apiBaseUrl;
  final String wsBaseUrl;
  final String appEnv;

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
  return AppConfig(apiBaseUrl: apiBase, wsBaseUrl: wsBase, appEnv: env);
});
