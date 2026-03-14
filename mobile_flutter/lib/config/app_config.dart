class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:8080/api');
  static const String wsBaseUrl = String.fromEnvironment('WS_BASE_URL', defaultValue: 'ws://localhost:8080/websocket');
  static const Duration requestTimeout = Duration(seconds: 10);
}
