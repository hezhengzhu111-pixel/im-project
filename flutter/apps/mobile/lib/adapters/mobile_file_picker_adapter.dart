import 'dart:io';
import 'package:file_picker/file_picker.dart' as fp;
import 'package:image_picker/image_picker.dart' as ip;
import 'package:im_core/core.dart';

/// Mobile file picker adapter using image_picker for camera/gallery
/// and file_picker for general file selection.
class MobileFilePickerAdapter implements FilePickerPort {
  final _imagePicker = ip.ImagePicker();

  @override
  Future<Result<PickedFile>> pickImage({
    ImageSource source = ImageSource.gallery,
  }) async {
    try {
      final imageSource = source == ImageSource.camera
          ? ip.ImageSource.camera
          : ip.ImageSource.gallery;

      final xFile = await _imagePicker.pickImage(source: imageSource);
      if (xFile == null) {
        return const Failure(OperationCancelled());
      }

      final file = File(xFile.path);
      final bytes = await file.readAsBytes();
      final name = xFile.name;

      return Success(PickedFile.fromBytes(
        name: name,
        mimeType: _getMimeType(name),
        bytes: bytes,
      ));
    } catch (e) {
      return const Failure(UnknownError('file_read_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> pickFile({
    List<String>? allowedExtensions,
  }) async {
    try {
      final result = await fp.FilePicker.pickFiles(
        type: allowedExtensions != null ? fp.FileType.custom : fp.FileType.any,
        allowedExtensions: allowedExtensions,
      );

      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }

      final file = result.files.first;
      final platformFile = file;

      // On mobile, read from path (not bytes).
      if (platformFile.path == null) {
        return const Failure(UnknownError('file_read_failed'));
      }

      final fileObj = File(platformFile.path!);
      final bytes = await fileObj.readAsBytes();

      return Success(PickedFile.fromBytes(
        name: platformFile.name,
        mimeType: _getMimeType(platformFile.name),
        bytes: bytes,
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
      'aac': 'audio/aac',
      'wav': 'audio/wav',
      'amr': 'audio/amr',
      'ogg': 'audio/ogg',
      'doc': 'application/msword',
      'docx':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'zip': 'application/zip',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }
}
