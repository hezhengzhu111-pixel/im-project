import 'package:im_core/core.dart';

/// Default message config when backend cannot be reached.
const defaultMessageConfig = MessageConfig(
  textEnforce: true,
  textMaxLength: 2000,
);

/// Split [text] into chunks of at most [maxLen] Unicode code points.
///
/// Uses `String.runes` to correctly handle emoji and multi-byte characters.
List<String> splitTextByCodePoints(String text, int maxLen) {
  final runes = text.runes.toList();
  if (runes.length <= maxLen) {
    return [text];
  }
  final chunks = <String>[];
  for (var i = 0; i < runes.length; i += maxLen) {
    final end = (i + maxLen < runes.length) ? i + maxLen : runes.length;
    chunks.add(String.fromCharCodes(runes.sublist(i, end)));
  }
  return chunks;
}
