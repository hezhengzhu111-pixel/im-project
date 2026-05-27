import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/settings_api.dart';

class SettingsNotifier extends StateNotifier<UserSettings?> {
  SettingsNotifier(this._api) : super(null);

  final SettingsApi _api;

  Future<void> loadSettings() async {
    state = await _api.getSettings();
  }

  Future<void> updateSettings(UserSettings settings) async {
    await _api.updateSettings(settings);
    state = settings;
  }
}
