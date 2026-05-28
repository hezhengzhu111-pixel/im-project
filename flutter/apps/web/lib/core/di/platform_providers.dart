import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

import '../../adapters/web_file_picker_adapter.dart';
import '../../adapters/web_notification_adapter.dart';
import '../../adapters/web_clipboard_adapter.dart';
import '../../adapters/web_share_adapter.dart';
import '../../adapters/web_audio_recorder_adapter.dart';

// Platform Capability Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  return WebFilePickerAdapter();
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  return WebNotificationAdapter();
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  return WebClipboardAdapter();
});

final sharePortProvider = Provider<SharePort>((ref) {
  return WebShareAdapter();
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  return WebAudioRecorderAdapter();
});
