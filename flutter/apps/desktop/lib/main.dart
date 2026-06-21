import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'app.dart';
import 'adapters/desktop_network_adapter.dart';
import 'adapters/desktop_storage_adapter.dart';
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
import 'adapters/e2ee/desktop_key_store.dart';
import 'adapters/e2ee/desktop_session_store.dart';
import 'package:im_shared_features/e2ee.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize settings persistence
  final settingsPersistence = SettingsPersistence();
  await settingsPersistence.init();

  // Get saved settings
  final savedLanguage = settingsPersistence.getLanguage();
  final savedThemeMode = settingsPersistence.getThemeMode();

  final rustGateway = FrbRustGateway();

  // Initialize logger first so Rust bridge failures are visible.
  AppLogger.init(
    errorReporter: NoopErrorReporterAdapter(),
  );

  // Initialize Rust bridge. A failure here is logged but does not crash the
  // app, so the user can still reach the UI and see an error message.
  try {
    await rustGateway.init();
  } catch (e, st) {
    AppLogger.instance.error('Rust bridge initialization failed', e, st, 'rust');
  }

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
      wsClientProvider.overrideWithValue(
        DesktopWsAdapter(
          ticketUrl: AuthEndpoints.wsTicket,
          wsBaseUrl: '$wsBase${WsEndpoints.path}',
          ticketProvider: () async {
            final response = await networkService.post<Map<String, dynamic>>(
              AuthEndpoints.wsTicket,
              fromJson: (json) => json,
            );
            return response.data['ticket'] as String?;
          },
        ),
      ),
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(rustGateway),
      e2eeKeyStoreProvider.overrideWithValue(DesktopKeyStore()),
      e2eeSessionStoreProvider.overrideWithValue(DesktopSessionStore()),
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
