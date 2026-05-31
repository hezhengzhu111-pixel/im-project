import 'dart:typed_data';

import 'package:im_core/core.dart';

/// Desktop E2EE adapter.
///
/// This is a placeholder implementation for the framework skeleton.
/// It delegates to FRB-generated Rust bindings for cryptographic operations.
/// The actual FRB initialization for desktop (IO) will be wired up when the
/// desktop build pipeline is configured.
class DesktopE2eeService implements E2eeBridge {
  @override
  Future<Uint8List> generateKeyBundle(int otkCount) async {
    throw UnimplementedError(
        'DesktopE2eeService.generateKeyBundle not yet implemented');
  }

  @override
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) async {
    throw UnimplementedError(
        'DesktopE2eeService.generateKeyBundleJson not yet implemented');
  }

  @override
  Future<Uint8List> x3dhInitiate(
    Uint8List identityKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) async {
    throw UnimplementedError(
        'DesktopE2eeService.x3dhInitiate not yet implemented');
  }

  @override
  Future<Uint8List> x3dhRespond(
    Uint8List identityKey,
    Uint8List ephemeralKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) async {
    throw UnimplementedError(
        'DesktopE2eeService.x3dhRespond not yet implemented');
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
    Uint8List state,
    Uint8List plaintext,
  ) async {
    throw UnimplementedError(
        'DesktopE2eeService.ratchetEncrypt not yet implemented');
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
    Uint8List state,
    Uint8List ciphertext,
  ) async {
    throw UnimplementedError(
        'DesktopE2eeService.ratchetDecrypt not yet implemented');
  }

  @override
  Future<Uint8List> exportState(Uint8List state) async {
    throw UnimplementedError(
        'DesktopE2eeService.exportState not yet implemented');
  }

  @override
  Future<Uint8List> restoreState(Uint8List state) async {
    throw UnimplementedError(
        'DesktopE2eeService.restoreState not yet implemented');
  }

  @override
  Future<Map<String, dynamic>> createOutboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String remoteBundleBase64,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.createOutboundSession not yet implemented');
  }

  @override
  Future<Map<String, dynamic>> createInboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String localSpkPairBase64,
    String? localOtkPairBase64,
    required String remoteIdentityKeyBase64,
    required String remoteHandshakeBase64,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.createInboundSession not yet implemented');
  }

  @override
  Future<Map<String, dynamic>> encryptMessage({
    required String stateBase64,
    required String plaintextBase64,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String sessionId,
    String? handshakeBase64,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.encryptMessage not yet implemented');
  }

  @override
  Future<Map<String, dynamic>> decryptMessage({
    required String stateBase64,
    required Map<String, dynamic> envelope,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.decryptMessage not yet implemented');
  }

  @override
  Future<String> exportSessionEnvelope({
    required String stateBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.exportSessionEnvelope not yet implemented');
  }

  @override
  Future<String> restoreSessionEnvelope({
    required String envelopeBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async {
    throw UnimplementedError(
        'DesktopE2eeService.restoreSessionEnvelope not yet implemented');
  }
}
