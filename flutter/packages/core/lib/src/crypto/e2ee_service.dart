import 'dart:typed_data';

abstract class E2eeService {
  Future<Uint8List> generateKeyBundle(int otkCount);
  Future<Uint8List> x3dhInitiate(
      Uint8List identityKey, Uint8List signedPreKey, Uint8List? oneTimePreKey);
  Future<Uint8List> x3dhRespond(Uint8List identityKey, Uint8List ephemeralKey,
      Uint8List signedPreKey, Uint8List? oneTimePreKey);
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
      Uint8List state, Uint8List plaintext);
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
      Uint8List state, Uint8List ciphertext);
  Future<Uint8List> exportState(Uint8List state);
  Future<Uint8List> restoreState(Uint8List state);
}
