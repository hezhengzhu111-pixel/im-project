import '../models/picked_file.dart';
import '../models/result.dart';

abstract class FilePickerPort {
  /// 选择图片
  Future<Result<PickedFile>> pickImage({ImageSource source});

  /// 选择文件
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions});
}

enum ImageSource { camera, gallery }
