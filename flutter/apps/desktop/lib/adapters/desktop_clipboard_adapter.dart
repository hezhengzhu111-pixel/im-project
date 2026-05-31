import 'package:flutter/services.dart';
import 'package:im_core/core.dart';

/// Desktop clipboard adapter using Flutter's built-in clipboard service.
class DesktopClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      await Clipboard.setData(ClipboardData(text: text));
      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_copy_failed'));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text;
      return Success(text?.isNotEmpty == true ? text : null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_paste_failed'));
    }
  }
}
