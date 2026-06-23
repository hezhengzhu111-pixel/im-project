/// Shared string helpers used across the `im_shared_features` package.
extension SafeSubstring on String {
  /// Returns the first non-whitespace character in upper case.
  ///
  /// If the string is empty (or only whitespace), [fallback] is returned.
  String safeFirstCharUpper({String fallback = '?'}) {
    final trimmed = trim();
    return trimmed.isNotEmpty ? trimmed.substring(0, 1).toUpperCase() : fallback;
  }
}
