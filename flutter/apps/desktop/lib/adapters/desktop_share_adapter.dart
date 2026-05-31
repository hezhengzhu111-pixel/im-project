import 'package:im_core/core.dart';

/// Desktop share adapter.
///
/// This is a placeholder implementation for the framework skeleton.
/// Desktop platforms have limited native share support. Consider using
/// `share_plus` or platform channels for production use.
class DesktopShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async => const Success(false);

  @override
  Future<Result<void>> shareText(String text) async {
    return const Failure(UnsupportedCapability('share'));
  }

  @override
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  }) async {
    return const Failure(UnsupportedCapability('share_file'));
  }
}
