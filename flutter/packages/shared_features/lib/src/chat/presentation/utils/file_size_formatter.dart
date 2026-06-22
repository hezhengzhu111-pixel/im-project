/// Formats a byte count into a human-readable string.
///
/// Uses binary units (B / KB / MB / GB) and one decimal place for
/// KB and above, matching the P1 media message requirement.
class FileSizeFormatter {
  FileSizeFormatter._();

  static String format(int? bytes) {
    if (bytes == null || bytes < 0) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
}
