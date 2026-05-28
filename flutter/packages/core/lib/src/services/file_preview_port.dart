import 'models.dart';

/// Abstract port for file preview services.
///
/// Implementations handle platform-specific file preview
/// (e.g., browser-native for web, native viewers for mobile).
abstract class FilePreviewPort {
  /// Check if a MIME type can be previewed.
  bool canPreview(String mimeType);

  /// Open a file preview for the given request.
  void openPreview(FilePreviewRequest request);
}

/// Noop implementation that reports nothing as previewable.
class NoopFilePreviewPort implements FilePreviewPort {
  @override
  bool canPreview(String mimeType) => false;

  @override
  void openPreview(FilePreviewRequest request) {}
}
