import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart' as core_flutter;
import 'package:im_rust_bridge/im_rust_bridge.dart';
import 'app.dart';
import 'adapters/web_file_picker_adapter.dart';
import 'adapters/web_notification_adapter.dart';
import 'adapters/web_clipboard_adapter.dart';
import 'adapters/web_share_adapter.dart';
import 'adapters/web_audio_recorder_adapter.dart';
import 'adapters/web_storage_adapter.dart';
import 'adapters/web_http_adapter.dart';
import 'adapters/web_ws_adapter.dart';
import 'adapters/services/noop_analytics_adapter.dart';
import 'adapters/services/noop_error_reporter_adapter.dart';
import 'adapters/services/noop_push_adapter.dart';
import 'core/di/platform_providers.dart';
import 'core/network/network_providers.dart';
import 'core/network/network_status_initializer.dart';
import 'core/observer/app_provider_observer.dart';
import 'features/auth/presentation/auth_providers.dart' as web_auth;
import 'features/e2ee/data/e2ee_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  final rustGateway = FrbRustGateway();
  initNetworkStatus();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');

  // Build config from compile-time environment variables (same defaults as
  // appConfigProvider) so we can construct web adapters before the
  // ProviderScope is created.
  // API端点已包含 /api 前缀，baseUrl 设为空字符串避免重复
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: '', // 将在运行时动态构建
  );
  final wsEndpoint =
      wsBase.isEmpty ? WsEndpoints.path : '$wsBase${WsEndpoints.path}';
  final secureStorage = WebSecureStorageAdapter();
  final httpClient = WebHttpClient(baseUrl: apiBase);
  final filePicker = WebFilePickerAdapter();
  final notification = WebNotificationAdapter();
  final clipboard = WebClipboardAdapter();
  final share = WebShareAdapter();
  final audioRecorder = WebAudioRecorderAdapter();
  final storage = WebStorageAdapter();
  final wsClient = WebWsClient(
    ticketUrl: AuthEndpoints.wsTicket,
    wsBaseUrl: wsEndpoint,
    ticketProvider: () async {
      final response = await httpClient.post<Map<String, dynamic>>(
        AuthEndpoints.wsTicket,
        fromJson: (json) => json,
      );
      return response.data['ticket'] as String?;
    },
  );
  final analytics = NoopAnalyticsAdapter();
  final errorReporter = NoopErrorReporterAdapter();
  final push = NoopPushAdapter();

  runApp(ProviderScope(
    overrides: [
      // Platform capability adapters
      filePickerPortProvider.overrideWithValue(filePicker),
      notificationPortProvider.overrideWithValue(notification),
      clipboardPortProvider.overrideWithValue(clipboard),
      sharePortProvider.overrideWithValue(share),
      audioRecorderPortProvider.overrideWithValue(audioRecorder),
      // Network & storage adapters
      secureStorageProvider.overrideWithValue(secureStorage),
      storageProvider.overrideWithValue(storage),
      httpClientProvider.overrideWithValue(httpClient),
      wsClientProvider.overrideWithValue(wsClient),
      // E2EE adapter
      e2eeAdapterProvider.overrideWithValue(rustGateway),
      e2eeKeyStoreProvider.overrideWith((ref) {
        return ref.watch(webE2eeKeyStoreProvider);
      }),
      e2eeSessionStoreProvider.overrideWith((ref) {
        return ref.watch(webE2eeSessionStoreProvider);
      }),
      e2eeManagerProvider.overrideWith((ref) {
        return E2eeManager(
          adapter: ref.watch(e2eeAdapterProvider),
          api: ref.watch(e2eeApiProvider),
          keyStore: ref.watch(e2eeKeyStoreProvider),
          sessionStore: ref.watch(e2eeSessionStoreProvider),
          metaStore: ref.watch(e2eeMetaStoreProvider),
          currentUserId: ref.watch(web_auth.currentUserIdProvider),
        );
      }),
      // Shared feature packages read the im_core_flutter provider set.
      core_flutter.filePickerPortProvider.overrideWithValue(filePicker),
      core_flutter.notificationPortProvider.overrideWithValue(notification),
      core_flutter.clipboardPortProvider.overrideWithValue(clipboard),
      core_flutter.sharePortProvider.overrideWithValue(share),
      core_flutter.audioRecorderPortProvider.overrideWithValue(audioRecorder),
      core_flutter.secureStorageProvider.overrideWithValue(secureStorage),
      core_flutter.storageProvider.overrideWithValue(storage),
      core_flutter.httpClientProvider.overrideWithValue(httpClient),
      core_flutter.wsClientProvider.overrideWithValue(wsClient),
      core_flutter.e2eeAdapterProvider.overrideWithValue(rustGateway),
      core_flutter.analyticsProvider.overrideWithValue(analytics),
      core_flutter.errorReporterProvider.overrideWithValue(errorReporter),
      core_flutter.pushProvider.overrideWithValue(push),
    ],
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));

  warmUpRustBridge(rustGateway);
}

void warmUpRustBridge(RustGateway rustGateway) {
  unawaited(
    rustGateway.init().catchError((Object error, StackTrace stackTrace) {
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stackTrace,
          library: 'im_web',
          context: ErrorDescription('while warming up the Rust bridge'),
        ),
      );
    }),
  );
}
