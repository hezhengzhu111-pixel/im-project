import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      return Success(web.window.navigator.canShare != null);
    } catch (e) {
      return const Failure(UnknownError('share_check_failed'));
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      final available = await isAvailable();
      if (available case Success(:final data) when !data) {
        return const Failure(UnsupportedCapability('share'));
      }

      await web.window.navigator
          .share(web.ShareData(text: text))
          .toDart;
      return const Success(null);
    } catch (e) {
      if (e is web.DOMException && e.name == 'AbortError') {
        return const Failure(OperationCancelled());
      }
      return const Failure(UnknownError('share_failed'));
    }
  }

  @override
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  }) async {
    return const Failure(UnsupportedCapability('share_file'));
  }
}
