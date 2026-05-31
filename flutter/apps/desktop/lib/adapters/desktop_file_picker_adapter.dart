import 'package:im_core/core.dart';

/// Desktop file picker adapter.
///
/// This is a placeholder implementation for the framework skeleton.
/// Replace with `file_picker` package integration for production use.
class DesktopFilePickerAdapter implements FilePickerPort {
  @override
  Future<Result<PickedFile>> pickImage({
    ImageSource source = ImageSource.gallery,
  }) async {
    return const Failure(UnknownError('file_picker_not_implemented'));
  }

  @override
  Future<Result<PickedFile>> pickFile({
    List<String>? allowedExtensions,
  }) async {
    return const Failure(UnknownError('file_picker_not_implemented'));
  }
}
