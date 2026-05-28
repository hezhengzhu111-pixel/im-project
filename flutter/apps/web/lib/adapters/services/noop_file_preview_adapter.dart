import 'package:im_core/core.dart';

/// Web adapter for file preview. Currently Noop.
/// Replace with browser-native preview logic when ready.
class NoopFilePreviewAdapter implements FilePreviewPort {
  @override
  bool canPreview(String mimeType) => false;

  @override
  void openPreview(FilePreviewRequest request) {}
}
