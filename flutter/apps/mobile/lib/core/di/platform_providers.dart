import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// ---------------------------------------------------------------------------
// Platform Capability Providers
//
// These providers are intentionally left without default implementations to
// keep this file free of platform-specific imports. This allows VM tests to
// import and override these providers without triggering compilation errors.
//
// On mobile, the real adapters are provided via ProviderScope overrides in
// main.dart. Tests provide mocks the same way.
// ---------------------------------------------------------------------------

final filePickerPortProvider = Provider<FilePickerPort>(
  (ref) => throw UnimplementedError(
    'filePickerPortProvider must be overridden at app startup',
  ),
);

final notificationPortProvider = Provider<NotificationPort>(
  (ref) => throw UnimplementedError(
    'notificationPortProvider must be overridden at app startup',
  ),
);

final clipboardPortProvider = Provider<ClipboardPort>(
  (ref) => throw UnimplementedError(
    'clipboardPortProvider must be overridden at app startup',
  ),
);

final sharePortProvider = Provider<SharePort>(
  (ref) => throw UnimplementedError(
    'sharePortProvider must be overridden at app startup',
  ),
);

final audioRecorderPortProvider = Provider<AudioRecorderPort>(
  (ref) => throw UnimplementedError(
    'audioRecorderPortProvider must be overridden at app startup',
  ),
);

// ---------------------------------------------------------------------------
// Network & Storage Providers
// ---------------------------------------------------------------------------

final secureStorageProvider = Provider<SecureStoragePort>(
  (ref) => throw UnimplementedError(
    'secureStorageProvider must be overridden at app startup',
  ),
);

final storageProvider = Provider<StoragePort>(
  (ref) => throw UnimplementedError(
    'storageProvider must be overridden at app startup',
  ),
);

final httpClientProvider = Provider<HttpClientPort>(
  (ref) => throw UnimplementedError(
    'httpClientProvider must be overridden at app startup',
  ),
);

final wsClientProvider = Provider<WsClientPort>(
  (ref) => throw UnimplementedError(
    'wsClientProvider must be overridden at app startup',
  ),
);

final wsStateProvider = StreamProvider<WsConnectionState>(
  (ref) => ref.watch(wsClientProvider).connectionState,
);

// ---------------------------------------------------------------------------
// E2EE Provider
// ---------------------------------------------------------------------------

final e2eeAdapterProvider = Provider<E2eeBridge>(
  (ref) => throw UnimplementedError(
    'e2eeAdapterProvider must be overridden at app startup',
  ),
);

// ---------------------------------------------------------------------------
// Language & Theme Providers
// ---------------------------------------------------------------------------

final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>(
  (ref) => ThemeMode.system,
);
