import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  throw UnimplementedError(
    'filePickerPortProvider must be overridden at app startup',
  );
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  throw UnimplementedError(
    'notificationPortProvider must be overridden at app startup',
  );
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  throw UnimplementedError(
    'clipboardPortProvider must be overridden at app startup',
  );
});

final sharePortProvider = Provider<SharePort>((ref) {
  throw UnimplementedError(
    'sharePortProvider must be overridden at app startup',
  );
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  throw UnimplementedError(
    'audioRecorderPortProvider must be overridden at app startup',
  );
});
