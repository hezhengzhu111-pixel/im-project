import 'package:share_plus/share_plus.dart';
import 'package:im_core/core.dart';

class DesktopShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      // share_plus has limited support on desktop but can be attempted.
      return const Success(true);
    } catch (e) {
      return const Success(false);
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      await Share.share(text);
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError('share_failed'));
    }
  }

  @override
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  }) async {
    try {
      await Share.shareXFiles([XFile(filePath)]);
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError('share_failed'));
    }
  }
}
