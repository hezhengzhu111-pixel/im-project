import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/ai_api.dart';

class AiSettingsState {
  const AiSettingsState({
    this.loading = false,
    this.creatingKey = false,
    this.savingSettings = false,
    this.keys = const [],
    this.aiSettings,
    this.testingKeyId,
    this.deletingKeyId,
    this.errorMessage,
    this.successMessage,
  });

  final bool loading;
  final bool creatingKey;
  final bool savingSettings;
  final List<AiApiKey> keys;
  final AiSettings? aiSettings;
  final String? testingKeyId;
  final String? deletingKeyId;
  final String? errorMessage;
  final String? successMessage;

  AiSettingsState copyWith({
    bool? loading,
    bool? creatingKey,
    bool? savingSettings,
    List<AiApiKey>? keys,
    AiSettings? aiSettings,
    String? testingKeyId,
    String? deletingKeyId,
    String? errorMessage,
    String? successMessage,
    bool clearAiSettings = false,
    bool clearTestingKeyId = false,
    bool clearDeletingKeyId = false,
    bool clearMessages = false,
  }) {
    return AiSettingsState(
      loading: loading ?? this.loading,
      creatingKey: creatingKey ?? this.creatingKey,
      savingSettings: savingSettings ?? this.savingSettings,
      keys: keys ?? this.keys,
      aiSettings: clearAiSettings ? null : (aiSettings ?? this.aiSettings),
      testingKeyId:
          clearTestingKeyId ? null : (testingKeyId ?? this.testingKeyId),
      deletingKeyId:
          clearDeletingKeyId ? null : (deletingKeyId ?? this.deletingKeyId),
      errorMessage: clearMessages ? null : (errorMessage ?? this.errorMessage),
      successMessage:
          clearMessages ? null : (successMessage ?? this.successMessage),
    );
  }
}

class AiSettingsNotifier extends StateNotifier<AiSettingsState> {
  AiSettingsNotifier(this._api) : super(const AiSettingsState());

  final AiApi _api;

  Future<void> loadKeys() async {
    state = state.copyWith(loading: true, clearMessages: true);
    try {
      final keys = await _api.getKeys();
      state = state.copyWith(loading: false, keys: keys);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        errorMessage: _errorText(e),
      );
    }
  }

  Future<bool> createKey(AiApiKeyCreateRequest request) async {
    state = state.copyWith(creatingKey: true, clearMessages: true);
    try {
      final newKey = await _api.createKey(request);
      state = state.copyWith(
        creatingKey: false,
        keys: [newKey, ...state.keys],
        successMessage: 'API key saved.',
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        creatingKey: false,
        errorMessage: _errorText(e),
      );
      return false;
    }
  }

  Future<bool> deleteKey(String id) async {
    state = state.copyWith(deletingKeyId: id, clearMessages: true);
    try {
      await _api.deleteKey(id);
      state = state.copyWith(
        keys: state.keys.where((k) => k.id != id).toList(),
        clearDeletingKeyId: true,
        successMessage: 'API key deleted.',
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        clearDeletingKeyId: true,
        errorMessage: _errorText(e),
      );
      return false;
    }
  }

  Future<bool> testKey(String id) async {
    state = state.copyWith(testingKeyId: id, clearMessages: true);
    try {
      final status = await _api.testKey(id);
      state = state.copyWith(
        keys: state.keys
            .map((k) => k.id == id
                ? AiApiKey(
                    id: k.id,
                    provider: k.provider,
                    key: k.key,
                    label: k.label,
                    status: status,
                    createdAt: k.createdAt,
                  )
                : k)
            .toList(),
        clearTestingKeyId: true,
        successMessage: 'API key test completed.',
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        clearTestingKeyId: true,
        errorMessage: _errorText(e),
      );
      return false;
    }
  }

  Future<void> loadAiSettings() async {
    try {
      final settings = await _api.getAiSettings();
      state = state.copyWith(aiSettings: settings);
    } catch (e) {
      state = state.copyWith(errorMessage: _errorText(e));
    }
  }

  Future<bool> updateAiSettings(AiSettings settings) async {
    final previous = state.aiSettings;
    state = state.copyWith(
      aiSettings: settings,
      savingSettings: true,
      clearMessages: true,
    );
    try {
      await _api.updateAiSettings(settings);
      state = state.copyWith(
        savingSettings: false,
        successMessage: 'AI settings saved.',
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        aiSettings: previous,
        clearAiSettings: previous == null,
        savingSettings: false,
        errorMessage: _errorText(e),
      );
      return false;
    }
  }

  String _errorText(Object error) {
    final text = error.toString().trim();
    return text.isEmpty ? 'Operation failed.' : text;
  }
}
