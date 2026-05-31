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
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'core/di/platform_providers.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Flutter Rust Bridge
  await RustLib.init();

  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );

  final storageService = await DesktopStorageService.create();
  final secureStorageService = DesktopSecureStorageAdapter();
  final networkService = DesktopNetworkService(baseUrl: apiBase);
  final e2eeService = DesktopE2eeService();

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
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(e2eeService),
      // 第三方服务适配器
      analyticsProvider.overrideWithValue(NoopAnalyticsAdapter()),
      errorReporterProvider.overrideWithValue(NoopErrorReporterAdapter()),
      pushProvider.overrideWithValue(NoopPushAdapter()),
    ],
    child: const App(),
  ));
}
