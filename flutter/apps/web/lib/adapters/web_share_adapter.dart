import 'package:im_core/core.dart';

class WebShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      // 实际实现需要通过 dart:js_interop 检查 navigator.share
      return const Success(false);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      if (!await isAvailable().then((r) => r is Success ? r.data : false)) {
        return const Failure(UnsupportedCapability('share'));
      }

      // 实际实现需要通过 dart:js_interop 使用 Web Share API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> shareFile({required String filePath, String? mimeType}) async {
    return const Failure(UnsupportedCapability('share_file'));
  }
}
