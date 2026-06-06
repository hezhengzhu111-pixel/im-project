import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/src/logging/app_logger.dart';
import '../data/ai_api.dart';

class AiSettingsState {
  const AiSettingsState({
    this.loading = false,
    this.keys = const [],
    this.aiSettings,
    this.testingKeyId,
  });

  final bool loading;
  final List<AiApiKey> keys;
  final AiSettings? aiSettings;
  final String? testingKeyId;

  AiSettingsState copyWith({
    bool? loading,
    List<AiApiKey>? keys,
    AiSettings? aiSettings,
    String? testingKeyId,
    bool clearTestingKeyId = false,
  }) {
    return AiSettingsState(
      loading: loading ?? this.loading,
      keys: keys ?? this.keys,
      aiSettings: aiSettings ?? this.aiSettings,
      testingKeyId: clearTestingKeyId ? null : (testingKeyId ?? this.testingKeyId),
    );
  }
}

class AiSettingsNotifier extends StateNotifier<AiSettingsState> {
  AiSettingsNotifier(this._api) : super(const AiSettingsState());

  final AiApi _api;

  Future<void> loadKeys() async {
    state = state.copyWith(loading: true);
    try {
      final keys = await _api.getKeys();
      state = state.copyWith(loading: false, keys: keys);
    } catch (e) {
      state = state.copyWith(loading: false);
      rethrow;
    }
  }

  Future<void> createKey(AiApiKeyCreateRequest request) async {
    final newKey = await _api.createKey(request);
    state = state.copyWith(keys: [...state.keys, newKey]);
  }

  Future<void> deleteKey(String id) async {
    await _api.deleteKey(id);
    state = state.copyWith(
      keys: state.keys.where((k) => k.id != id).toList(),
    );
  }

  Future<void> testKey(String id) async {
    state = state.copyWith(testingKeyId: id);
    try {
      final status = await _api.testKey(id);
      state = state.copyWith(
        keys: state.keys.map((k) =>
            k.id == id ? AiApiKey(id: k.id, provider: k.provider, key: k.key, label: k.label, status: status, createdAt: k.createdAt) : k
        ).toList(),
        clearTestingKeyId: true,
      );
    } catch (e) {
      state = state.copyWith(clearTestingKeyId: true);
      rethrow;
    }
  }

  Future<void> loadAiSettings() async {
    try {
      final settings = await _api.getAiSettings();
      state = state.copyWith(aiSettings: settings);
    } catch (e, st) {
      AppLogger.instance.warn('Failed to load AI settings', e, st);
    }
  }

  Future<void> updateAiSettings(AiSettings settings) async {
    final previous = state.aiSettings;
    state = state.copyWith(aiSettings: settings);
    try {
      await _api.updateAiSettings(settings);
    } catch (e) {
      state = state.copyWith(aiSettings: previous);
      rethrow;
    }
  }
}
