import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/src/generated/frb_generated.dart';
import 'app.dart';
import 'adapters/desktop_network_adapter.dart';
import 'adapters/desktop_storage_adapter.dart';
import 'adapters/desktop_e2ee_adapter.dart';
import 'adapters/desktop_file_picker_adapter.dart';
import 'adapters/desktop_notification_adapter.dart';
import 'adapters/desktop_clipboard_adapter.dart';
import 'adapters/desktop_share_adapter.dart';
import 'adapters/desktop_audio_recorder_adapter.dart';
import 'adapters/desktop_ws_adapter.dart';
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'core/di/platform_providers.dart';
import 'core/logging/app_logger.dart';
import 'core/settings/settings_persistence.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize settings persistence
  final settingsPersistence = SettingsPersistence();
  await settingsPersistence.init();

  // Get saved settings
  final savedLanguage = settingsPersistence.getLanguage();
  final savedThemeMode = settingsPersistence.getThemeMode();

  // Initialize Flutter Rust Bridge
  await RustLib.init();

  // Initialize logger
  AppLogger.init(
    errorReporter: NoopErrorReporterAdapter(),
  );

  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );

  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:8082',
  );

  final storageService = await DesktopStorageService.create();
  final secureStorageService = DesktopSecureStorageAdapter();
  final networkService = DesktopNetworkService(baseUrl: apiBase);
  final e2eeService = DesktopE2eeService();

  // Initialize WebSocket adapter with base URL
  final wsService = DesktopWsAdapter();
  // Connect to WebSocket server
  await wsService.connect('$wsBase/ws');

  runApp(ProviderScope(
    overrides: [
      // 平台能力适配器
      filePickerPortProvider.overrideWithValue(DesktopFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(DesktopNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(DesktopClipboardAdapter()),
      sharePortProvider.overrideWithValue(DesktopShareAdapter()),
      audioRecorderPortProvider
          .overrideWithValue(DesktopAudioRecorderAdapter()),
      // 网络和存储适配器
      httpClientProvider.overrideWithValue(networkService),
      storageProvider.overrideWithValue(storageService),
      secureStorageProvider.overrideWithValue(secureStorageService),
      wsClientProvider.overrideWithValue(wsService),
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(e2eeService),
      // 第三方服务适配器
      analyticsProvider.overrideWithValue(NoopAnalyticsAdapter()),
      errorReporterProvider.overrideWithValue(NoopErrorReporterAdapter()),
      pushProvider.overrideWithValue(NoopPushAdapter()),
      // 设置持久化（从本地存储恢复）
      languageProvider.overrideWith((ref) => savedLanguage),
      themeModeProvider.overrideWith((ref) => savedThemeMode),
    ],
    child: App(settingsPersistence: settingsPersistence),
  ));
}
