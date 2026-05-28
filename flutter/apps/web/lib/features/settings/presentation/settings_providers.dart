import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/network/network_providers.dart';
import '../../../core/platform/platform_adapter.dart';
import '../data/ai_api.dart';
import '../data/settings_api.dart';
import 'ai_settings_provider.dart';
import 'profile_provider.dart';
import 'settings_provider.dart';

final settingsApiProvider = Provider<SettingsApi>((ref) {
  return SettingsApi(ref.watch(httpClientProvider));
});

final settingsStateProvider =
    StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});

final aiApiProvider = Provider<AiApi>((ref) {
  return AiApi(ref.watch(httpClientProvider));
});

final aiSettingsStateProvider =
    StateNotifierProvider<AiSettingsNotifier, AiSettingsState>((ref) {
  return AiSettingsNotifier(ref.watch(aiApiProvider));
});

final profileStateProvider =
    StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  return ProfileNotifier(ref.watch(settingsApiProvider));
});

// 从localStorage读取初始语言
String _getInitialLanguage() {
  final adapter = getPlatformAdapter();
  final saved = adapter.getLocalStorage('app_language');
  if (saved != null && (saved == 'en' || saved == 'zh')) {
    return saved;
  }

  // 读取浏览器语言
  final browserLang = adapter.getBrowserLanguage();
  if (browserLang != null && browserLang.startsWith('zh')) return 'zh';
  if (browserLang != null && browserLang.startsWith('en')) return 'en';

  // fallback到中文
  return 'zh';
}

// 从localStorage读取初始主题
ThemeMode _getInitialThemeMode() {
  final adapter = getPlatformAdapter();
  final saved = adapter.getLocalStorage('app_theme_mode');
  if (saved != null) {
    switch (saved) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
        return ThemeMode.system;
    }
  }
  return ThemeMode.system;
}

final languageProvider = StateProvider<String>((ref) => _getInitialLanguage());
final themeModeProvider =
    StateProvider<ThemeMode>((ref) => _getInitialThemeMode());
