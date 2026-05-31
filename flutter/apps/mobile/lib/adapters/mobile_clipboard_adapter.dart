import 'package:flutter/services.dart';
import 'package:im_core/core.dart';

/// Mobile clipboard adapter using Flutter's Clipboard service.
class MobileClipboardAdapter implements ClipboardPort {
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
      return Success(text != null && text.isNotEmpty ? text : null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_paste_failed'));
    }
  }
}
