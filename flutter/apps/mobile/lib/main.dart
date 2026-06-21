import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/e2ee.dart';
import 'package:im_shared_features/auth.dart' show currentUserIdProvider;
import 'package:im_core_flutter/im_core_flutter.dart';

import 'adapters/mobile_audio_recorder_adapter.dart';
import 'adapters/mobile_clipboard_adapter.dart';
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
import 'adapters/e2ee/mobile_key_store.dart';
import 'adapters/e2ee/mobile_session_store.dart';
import 'features/chat/chat.dart';

/// Entry point for the IM Mobile application.
///
/// Initializes Flutter bindings, Rust FFI, and configures all platform
/// adapters via Riverpod ProviderScope overrides before launching the app.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final rustGateway = FrbRustGateway();
  await rustGateway.init();

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

  // Initialize SharedPreferences for E2EE chat (outbox + sent message cache).
  final sharedPrefs = await SharedPreferences.getInstance();
  final mobileSentMessageCache =
      MobileSentMessageCache(sharedPrefs, secureStorage);

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
      e2eeAdapterProvider.overrideWithValue(rustGateway),
      e2eeKeyStoreProvider.overrideWithValue(MobileKeyStore()),
      e2eeSessionStoreProvider.overrideWithValue(MobileSessionStore()),
      // Mobile E2EE chat providers (outbox + sent message cache)
      sentMessageCacheProvider.overrideWithValue(mobileSentMessageCache),
      mobileSentMessageCacheProvider.overrideWithValue(mobileSentMessageCache),
      mobileMessageOutboxProvider
          .overrideWithValue(MobileMessageOutbox(sharedPrefs)),
      // Override shared chatStateProvider with E2EE-capable ChatNotifier
      chatStateProvider.overrideWith((ref) {
        return ChatNotifier(
          ref.watch(messageApiProvider),
          MessagePipeline(),
          ref.watch(wsClientProvider),
          () => ref.read(currentUserIdProvider),
          e2eeManager: ref.watch(e2eeManagerProvider),
          e2eeMetaStore: ref.watch(e2eeMetaStoreProvider),
          sentMessageCache: ref.watch(mobileSentMessageCacheProvider),
          outbox: ref.watch(mobileMessageOutboxProvider),
          onE2eeStatusChanged: (sessionId) {
            ref.invalidate(e2eeSessionStatusProvider(sessionId));
          },
        );
      }),
      // Third-party service adapters
      analyticsProvider.overrideWithValue(NoopAnalyticsAdapter()),
      errorReporterProvider.overrideWithValue(NoopErrorReporterAdapter()),
      pushProvider.overrideWithValue(NoopPushAdapter()),
    ],
    child: const App(),
  ));
}
