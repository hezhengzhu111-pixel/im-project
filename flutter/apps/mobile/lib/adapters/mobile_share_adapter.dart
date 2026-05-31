import 'dart:io';

import 'package:im_core/core.dart';
import 'package:share_plus/share_plus.dart';

/// Mobile share adapter using share_plus package.
class MobileShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      // share_plus is always available on mobile platforms.
      return const Success(true);
    } catch (e) {
      return const Failure(UnknownError('share_check_failed'));
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      await Share.share(text);
      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('share_failed'));
    }
  }

  @override
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  }) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        return const Failure(UnknownError('file_not_found'));
      }

      final xFile = XFile(filePath, mimeType: mimeType);
      await Share.shareXFiles([xFile]);
      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('share_file_failed'));
    }
  }
}
