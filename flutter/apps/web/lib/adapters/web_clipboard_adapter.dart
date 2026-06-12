import 'dart:js_interop';

import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      await web.window.navigator.clipboard.writeText(text).toDart;
      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_copy_failed'));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      final jsString = await web.window.navigator.clipboard.readText().toDart;
      final text = jsString.toDart;
      return Success(text.isNotEmpty ? text : null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_paste_failed'));
    }
  }
}
