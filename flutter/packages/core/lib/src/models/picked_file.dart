import 'dart:typed_data';

class PickedFile {
  const PickedFile({
    required this.name,
    required this.mimeType,
    required this.bytes,
    required this.size,
  });

  final String name;
  final String mimeType;
  final Uint8List bytes;
  final int size;

  factory PickedFile.fromBytes({
    required String name,
    required String mimeType,
    required Uint8List bytes,
  }) {
    return PickedFile(
      name: name,
      mimeType: mimeType,
      bytes: bytes,
      size: bytes.length,
    );
  }
}
