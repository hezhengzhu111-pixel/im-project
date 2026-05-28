import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// ---------------------------------------------------------------------------
// Platform Capability Providers
//
// These providers are intentionally left without default implementations to
// keep this file free of web-specific imports (dart:js_interop, package:web).
// This allows VM tests to import and override these providers without
// triggering web-only compilation errors.
//
// On web, the real adapters are provided via ProviderScope overrides in
// main.dart.  Tests provide mocks the same way.
// ---------------------------------------------------------------------------

final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  throw UnimplementedError(
      'filePickerPortProvider must be overridden at app startup');
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  throw UnimplementedError(
      'notificationPortProvider must be overridden at app startup');
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  throw UnimplementedError(
      'clipboardPortProvider must be overridden at app startup');
});

final sharePortProvider = Provider<SharePort>((ref) {
  throw UnimplementedError(
      'sharePortProvider must be overridden at app startup');
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  throw UnimplementedError(
      'audioRecorderPortProvider must be overridden at app startup');
});
