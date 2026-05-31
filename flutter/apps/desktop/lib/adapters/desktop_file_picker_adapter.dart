import 'package:file_picker/file_picker.dart';
import 'package:im_core/core.dart';

class DesktopFilePickerAdapter implements FilePickerPort {
  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }

      final file = result.files.first;
      if (file.bytes == null) {
        return const Failure(UnknownError('file_read_failed'));
      }

      return Success(PickedFile.fromBytes(
        name: file.name,
        mimeType: _getMimeType(file.name),
        bytes: file.bytes!,
      ));
    } catch (e) {
      return const Failure(UnknownError('file_read_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: allowedExtensions != null ? FileType.custom : FileType.any,
        allowedExtensions: allowedExtensions,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }

      final file = result.files.first;
      if (file.bytes == null) {
        return const Failure(UnknownError('file_read_failed'));
      }

      return Success(PickedFile.fromBytes(
        name: file.name,
        mimeType: _getMimeType(file.name),
        bytes: file.bytes!,
      ));
    } catch (e) {
      return const Failure(UnknownError('file_read_failed'));
    }
  }

  String _getMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }
}
