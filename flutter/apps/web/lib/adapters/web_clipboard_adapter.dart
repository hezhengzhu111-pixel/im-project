import 'package:im_core/core.dart';

class WebClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      // 实际实现需要通过 dart:js_interop 使用 Clipboard API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      // 实际实现需要通过 dart:js_interop 使用 Clipboard API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }
}
