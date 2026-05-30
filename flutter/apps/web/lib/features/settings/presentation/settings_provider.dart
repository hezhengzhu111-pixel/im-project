import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/platform/platform_adapter.dart';
import '../data/settings_api.dart';

class SettingsNotifier extends StateNotifier<UserSettings?> {
  SettingsNotifier(this._api) : super(null);

  final SettingsApi _api;

  Future<void> loadSettings() async {
    try {
      state = await _api.getSettings();
    } catch (_) {
      // Keep current state
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
      // 清除 localStorage 中的设置缓存
      getPlatformAdapter().clearLocalStorage();

      // 清除 IndexedDB 中的离线数据（如果有）
      // 注意：IndexedDB 清理需要根据实际使用的数据库名称调整
      // await IndexedDBFactory.instance.deleteDatabase('im_app_cache');

      // 触发 UI 刷新
      state = state;
    } catch (e) {
      // 静默处理错误，不中断用户操作
      debugPrint('Clear cache failed: $e');
    }
  }
}
