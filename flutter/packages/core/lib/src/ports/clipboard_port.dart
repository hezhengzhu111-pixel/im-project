import '../models/result.dart';

abstract class ClipboardPort {
  /// 复制文本到剪贴板
  Future<Result<void>> copy(String text);

  /// 从剪贴板粘贴文本
  Future<Result<String?>> paste();
}
