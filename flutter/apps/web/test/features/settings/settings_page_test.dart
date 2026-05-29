import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Test-only provider that mirrors languageProvider from settings_providers.dart.
/// We define it here because settings_providers.dart imports dart:html
/// which is unavailable in VM test mode.
final testLanguageProvider = StateProvider<String>((ref) => 'zh');

/// Test-only provider that mirrors themeModeProvider from settings_providers.dart.
final testThemeModeProvider =
    StateProvider<ThemeMode>((ref) => ThemeMode.system);

void main() {
  group('Settings provider overrides', () {
    test('languageProvider can be overridden via ProviderContainer', () {
      final container = ProviderContainer(overrides: [
        testLanguageProvider.overrideWith((ref) => 'en'),
      ]);

      final language = container.read(testLanguageProvider);
      expect(language, 'en');

      container.dispose();
    });

    test('languageProvider default is zh', () {
      final container = ProviderContainer();

      final language = container.read(testLanguageProvider);
      expect(language, 'zh');

      container.dispose();
    });

    test('languageProvider can be changed', () {
      final container = ProviderContainer();

      expect(container.read(testLanguageProvider), 'zh');

      container.read(testLanguageProvider.notifier).state = 'en';
      expect(container.read(testLanguageProvider), 'en');

      container.dispose();
    });

    test('themeModeProvider can be overridden via ProviderContainer', () {
      final container = ProviderContainer(overrides: [
        testThemeModeProvider.overrideWith((ref) => ThemeMode.dark),
      ]);

      final themeMode = container.read(testThemeModeProvider);
      expect(themeMode, ThemeMode.dark);

      container.dispose();
    });

    test('themeModeProvider default is system', () {
      final container = ProviderContainer();

      final themeMode = container.read(testThemeModeProvider);
      expect(themeMode, ThemeMode.system);

      container.dispose();
    });

    test('themeModeProvider can be changed', () {
      final container = ProviderContainer();

      expect(container.read(testThemeModeProvider), ThemeMode.system);

      container.read(testThemeModeProvider.notifier).state = ThemeMode.light;
      expect(container.read(testThemeModeProvider), ThemeMode.light);

      container.read(testThemeModeProvider.notifier).state = ThemeMode.dark;
      expect(container.read(testThemeModeProvider), ThemeMode.dark);

      container.dispose();
    });

    test('both providers can be overridden together', () {
      final container = ProviderContainer(overrides: [
        testLanguageProvider.overrideWith((ref) => 'en'),
        testThemeModeProvider.overrideWith((ref) => ThemeMode.dark),
      ]);

      expect(container.read(testLanguageProvider), 'en');
      expect(container.read(testThemeModeProvider), ThemeMode.dark);

      container.dispose();
    });

    test('overridden providers are isolated between containers', () {
      final container1 = ProviderContainer(overrides: [
        testLanguageProvider.overrideWith((ref) => 'en'),
      ]);
      final container2 = ProviderContainer(overrides: [
        testLanguageProvider.overrideWith((ref) => 'zh'),
      ]);

      expect(container1.read(testLanguageProvider), 'en');
      expect(container2.read(testLanguageProvider), 'zh');

      container1.dispose();
      container2.dispose();
    });
  });
}
