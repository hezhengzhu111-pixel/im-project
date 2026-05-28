import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/config/app_config_provider.dart';

void main() {
  group('AppConfig', () {
    test('default values', () {
      const config = AppConfig(
        apiBaseUrl: 'http://localhost:8082',
        wsBaseUrl: 'ws://localhost:8082',
      );
      expect(config.appEnv, 'production');
      expect(config.isDevelopment, isFalse);
      expect(config.isProduction, isTrue);
    });

    test('custom values', () {
      const config = AppConfig(
        apiBaseUrl: 'https://api.example.com',
        wsBaseUrl: 'wss://ws.example.com',
        appEnv: 'development',
      );
      expect(config.isDevelopment, isTrue);
      expect(config.isProduction, isFalse);
      expect(config.apiBaseUrl, 'https://api.example.com');
      expect(config.wsBaseUrl, 'wss://ws.example.com');
    });

    test('staging env', () {
      const config = AppConfig(
        apiBaseUrl: 'https://staging.api.com',
        wsBaseUrl: 'wss://staging.ws.com',
        appEnv: 'staging',
      );
      expect(config.isDevelopment, isFalse);
      expect(config.isProduction, isFalse);
    });
  });

  group('appConfigProvider', () {
    test('reads from --dart-define defaults', () {
      final container = ProviderContainer();
      final config = container.read(appConfigProvider);
      expect(config.apiBaseUrl, isNotEmpty);
      expect(config.wsBaseUrl, isNotEmpty);
      container.dispose();
    });
  });
}
