import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/settings_api.dart';
import '../../../core/logging/app_logger.dart';

class SettingsNotifier extends StateNotifier<UserSettings?> {
  SettingsNotifier(this._api, this._storage) : super(null);

  final SettingsApi _api;
  final StoragePort _storage;

  Future<void> loadSettings() async {
    try {
      state = await _api.getSettings();
    } catch (e, st) {
      AppLogger.instance.warn('Failed to load settings', e, st);
    }
  }

  Future<void> updatePrivacySettings(PrivacySettings privacy) async {
    final current = state;
    if (current == null) return;
    state = current.copyWith(privacy: privacy);
    try {
      await _api.updateSettings('privacy', privacy.toJson());
    } catch (e) {
      state = current;
      rethrow;
    }
  }

  Future<void> updateMessageSettings(MessagePreferenceSettings message) async {
    final current = state;
    if (current == null) return;
    state = current.copyWith(message: message);
    try {
      await _api.updateSettings('message', message.toJson());
    } catch (e) {
      state = current;
      rethrow;
    }
  }

  Future<void> updateGeneralSettings(GeneralSettings general) async {
    final current = state;
    if (current == null) return;
    state = current.copyWith(general: general);
    try {
      await _api.updateSettings('general', general.toJson());
    } catch (e) {
      state = current;
      rethrow;
    }
  }

  Future<void> clearCache() async {
    try {
      // 清除 SharedPreferences 中的设置缓存
      await _storage.clear();
      // 重新从服务器加载设置，触发 UI 刷新
      await loadSettings();
    } catch (e) {
      // 静默处理错误，不中断用户操作
      debugPrint('Clear cache failed: $e');
    }
  }
}
