import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core/src/generated/frb_generated.dart';
import 'app.dart';
import 'adapters/web_file_picker_adapter.dart';
import 'adapters/web_notification_adapter.dart';
import 'adapters/web_clipboard_adapter.dart';
import 'adapters/web_share_adapter.dart';
import 'adapters/web_audio_recorder_adapter.dart';
import 'adapters/web_storage_adapter.dart';
import 'adapters/web_http_adapter.dart';
import 'adapters/web_ws_adapter.dart';
import 'adapters/web_e2ee_adapter.dart';
import 'core/di/platform_providers.dart';
import 'core/network/network_providers.dart';
import 'core/network/network_status_initializer.dart';
import 'core/observer/app_provider_observer.dart';
import 'features/e2ee/data/e2ee_providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await RustLib.init();
  initNetworkStatus();
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');

  // Build config from compile-time environment variables (same defaults as
  // appConfigProvider) so we can construct web adapters before the
  // ProviderScope is created.
  // 使用 127.0.0.1 而非 localhost，避免 wslrelay.exe 在 IPv6 上拦截请求
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://127.0.0.1:8082',
  );
  const wsBase = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://127.0.0.1:8082',
  );
  final secureStorage = WebSecureStorageAdapter();
  final httpClient = WebHttpClient(baseUrl: apiBase);

  runApp(ProviderScope(
    overrides: [
      // Platform capability adapters
      filePickerPortProvider.overrideWithValue(WebFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(WebNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(WebClipboardAdapter()),
      sharePortProvider.overrideWithValue(WebShareAdapter()),
      audioRecorderPortProvider.overrideWithValue(WebAudioRecorderAdapter()),
      // Network & storage adapters
      secureStorageProvider.overrideWithValue(secureStorage),
      storageProvider.overrideWithValue(WebStorageAdapter()),
      httpClientProvider.overrideWithValue(httpClient),
      wsClientProvider.overrideWithValue(
        WebWsClient(
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
      e2eeAdapterProvider.overrideWithValue(WebE2eeAdapter()),
    ],
    observers: [AppProviderObserver(env: env)],
    child: const App(),
  ));
}
