import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/observer/app_provider_observer.dart';

void Function(String?, {int? wrapWidth}) _originalDebugPrint = debugPrint;

void main() {
  group('AppProviderObserver', () {
    late AppProviderObserver observer;
    late List<String> logs;

    setUp(() {
      observer = AppProviderObserver(env: 'development');
      logs = [];
      _originalDebugPrint = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) {
        if (message != null) logs.add(message);
      };
    });

    tearDown(() {
      debugPrint = _originalDebugPrint;
    });

    test('does not log in production', () {
      final prodObserver = AppProviderObserver(env: 'production');
      final provider = Provider<String>((ref) => 'test');
      final container = ProviderContainer(
        overrides: [provider.overrideWithValue('test')],
        observers: [prodObserver],
      );

      container.read(provider);
      expect(logs, isEmpty);
      container.dispose();
    });

    test('logs non-sensitive providers in development', () {
      final provider = Provider<String>((ref) => 'test');
      final container = ProviderContainer(
        overrides: [provider.overrideWithValue('test')],
        observers: [observer],
      );

      container.read(provider);
      expect(logs.any((l) => l.contains('Provider')), isTrue);
      container.dispose();
    });

    test('filters sensitive provider names', () {
      expect(observer.isSensitive('authStateProvider'), isTrue);
      expect(observer.isSensitive('secureStorageProvider'), isTrue);
      expect(observer.isSensitive('wsClientProvider'), isTrue);
      expect(observer.isSensitive('chatStateProvider'), isFalse);
      expect(observer.isSensitive('contactsStateProvider'), isFalse);
    });
  });
}
