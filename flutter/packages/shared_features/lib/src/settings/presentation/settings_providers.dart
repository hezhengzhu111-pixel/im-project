import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
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
  return SettingsNotifier(ref.watch(settingsApiProvider), ref.watch(storageProvider));
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
