import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
// ignore: implementation_imports
import 'package:im_core/src/generated/frb_generated.dart';

import 'adapters/mobile_audio_recorder_adapter.dart';
import 'adapters/mobile_clipboard_adapter.dart';
import 'adapters/mobile_e2ee_adapter.dart';
import 'adapters/mobile_file_picker_adapter.dart';
import 'adapters/mobile_network_adapter.dart';
import 'adapters/mobile_notification_adapter.dart';
import 'adapters/mobile_share_adapter.dart';
import 'adapters/mobile_storage_adapter.dart';
import 'adapters/mobile_ws_adapter.dart';
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'app.dart';
import 'core/di/platform_providers.dart';
import 'core/logging/app_logger.dart';
import 'features/e2ee/data/mobile_key_store.dart';
import 'features/e2ee/data/mobile_session_store.dart';
import 'package:im_shared_features/e2ee.dart';

/// Entry point for the IM Mobile application.
///
/// Initializes Flutter bindings, Rust FFI, and configures all platform
/// adapters via Riverpod ProviderScope overrides before launching the app.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Flutter Rust Bridge for E2EE crypto operations.
  await RustLib.init();

  // Initialize logger
  AppLogger.init(
    errorReporter: NoopErrorReporterAdapter(),
  );

  // Build config from compile-time environment variables.
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:8082',
  );

  // Create platform adapters before ProviderScope.
  final secureStorage = MobileSecureStorageAdapter();
  final httpClient = MobileNetworkService(baseUrl: apiBase);

  runApp(ProviderScope(
    overrides: [
      // Platform capability adapters
      filePickerPortProvider.overrideWithValue(MobileFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(MobileNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(MobileClipboardAdapter()),
      sharePortProvider.overrideWithValue(MobileShareAdapter()),
      audioRecorderPortProvider.overrideWithValue(
        MobileAudioRecorderAdapter(),
      ),
      // Network & storage adapters
      secureStorageProvider.overrideWithValue(secureStorage),
      storageProvider.overrideWithValue(MobileStorageService()),
      httpClientProvider.overrideWithValue(httpClient),
      wsClientProvider.overrideWithValue(
        MobileWsClient(
          ticketUrl: AuthEndpoints.wsTicket,
          wsBaseUrl: '$wsBase${WsEndpoints.path}',
          ticketProvider: () async {
            final response = await httpClient.post<Map<String, dynamic>>(
              AuthEndpoints.wsTicket,
              fromJson: (json) => json,
            );
            return response.data['ticket'] as String?;
          },
        ),
      ),
      // E2EE adapter
      e2eeAdapterProvider.overrideWithValue(MobileE2eeService()),
      e2eeKeyStoreProvider.overrideWithValue(MobileKeyStore()),
      e2eeSessionStoreProvider.overrideWithValue(MobileSessionStore()),
      // Third-party service adapters
      analyticsProvider.overrideWithValue(NoopAnalyticsAdapter()),
      errorReporterProvider.overrideWithValue(NoopErrorReporterAdapter()),
      pushProvider.overrideWithValue(NoopPushAdapter()),
    ],
    child: const App(),
  ));
}
