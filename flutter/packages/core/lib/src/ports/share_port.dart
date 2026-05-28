import '../models/result.dart';

abstract class SharePort {
  /// 分享文本
  Future<Result<void>> shareText(String text);

  /// 分享文件
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  });

  /// 检查是否支持分享
  Future<Result<bool>> isAvailable();
}
