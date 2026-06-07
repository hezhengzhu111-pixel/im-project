import 'dart:convert';
import 'dart:typed_data';

import 'generated/api/e2ee.dart' as frb;
import 'rust_bridge_initializer.dart';
import 'rust_error_mapper.dart';
import 'rust_gateway.dart';

class FrbRustGateway implements RustGateway {
  @override
  Future<void> init() {
    return _run('init', () => RustBridgeInitializer.init());
  }

  @override
  Future<Uint8List> generateKeyBundle(int otkCount) {
    return _run(
      'generateKeyBundle',
      () => frb.generateKeyBundle(otkCount: otkCount),
    );
  }

  @override
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) {
    return _run('generateKeyBundleJson', () async {
      final result = await frb.generateKeyBundleJson(otkCount: otkCount);
      return jsonDecode(result) as Map<String, dynamic>;
    });
  }

  @override
  Future<Uint8List> x3dhInitiate(
    Uint8List identityKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) {
    return _run(
      'x3dhInitiate',
      () => frb.x3DhInitiate(
        identityKey: identityKey,
        signedPreKey: signedPreKey,
        oneTimePreKey: oneTimePreKey,
      ),
    );
  }

  @override
  Future<Uint8List> x3dhRespond(
    Uint8List identityKey,
    Uint8List ephemeralKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) {
    return _run(
      'x3dhRespond',
      () => frb.x3DhRespond(
        identityKey: identityKey,
        ephemeralKey: ephemeralKey,
        signedPreKey: signedPreKey,
        oneTimePreKey: oneTimePreKey,
      ),
    );
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
    Uint8List state,
    Uint8List plaintext,
  ) {
    return _run(
      'ratchetEncrypt',
      () => frb.ratchetEncrypt(stateBytes: state, plaintext: plaintext),
    );
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
    Uint8List state,
    Uint8List ciphertext,
  ) {
    return _run(
      'ratchetDecrypt',
      () => frb.ratchetDecrypt(stateBytes: state, ciphertext: ciphertext),
    );
  }

  @override
  Future<Uint8List> exportState(Uint8List state) {
    return _run('exportState', () => frb.exportState(stateBytes: state));
  }

  @override
  Future<Uint8List> restoreState(Uint8List state) {
    return _run('restoreState', () => frb.restoreState(stateBytes: state));
  }

  @override
  Future<Map<String, dynamic>> createOutboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String remoteBundleBase64,
  }) {
    return _run('createOutboundSession', () async {
      final remoteBundleJson = utf8.decode(base64Decode(remoteBundleBase64));
      final config = jsonEncode({
        'session_id': sessionId,
        'local_identity_key_pair': localIdentityKeyPairBase64,
        'remote_bundle_json': remoteBundleJson,
      });
      final result = await frb.createOutboundSession(configJson: config);
      return jsonDecode(result) as Map<String, dynamic>;
    });
  }

  @override
  Future<Map<String, dynamic>> createInboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String localSpkPairBase64,
    String? localOtkPairBase64,
    required String remoteIdentityKeyBase64,
    required String remoteHandshakeBase64,
  }) {
    return _run('createInboundSession', () async {
      final config = <String, dynamic>{
        'session_id': sessionId,
        'local_identity_key_pair': localIdentityKeyPairBase64,
        'local_spk_pair': localSpkPairBase64,
        'remote_identity_key': remoteIdentityKeyBase64,
        'remote_handshake': remoteHandshakeBase64,
      };
      if (localOtkPairBase64 != null) {
        config['local_otk_pair'] = localOtkPairBase64;
      }
      final result =
          await frb.createInboundSession(configJson: jsonEncode(config));
      return jsonDecode(result) as Map<String, dynamic>;
    });
  }

  @override
  Future<Map<String, dynamic>> encryptMessage({
    required String stateBase64,
    required String plaintextBase64,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String sessionId,
    String? handshakeBase64,
  }) {
    return _run('encryptMessage', () async {
      final config = <String, dynamic>{
        'state': stateBase64,
        'plaintext': plaintextBase64,
        'sender_device_id': senderDeviceId,
        'recipient_device_id': recipientDeviceId,
        'session_id': sessionId,
      };
      if (handshakeBase64 != null) {
        config['handshake'] = handshakeBase64;
      }
      final result = await frb.encryptMessage(configJson: jsonEncode(config));
      return jsonDecode(result) as Map<String, dynamic>;
    });
  }

  @override
  Future<Map<String, dynamic>> decryptMessage({
    required String stateBase64,
    required Map<String, dynamic> envelope,
  }) {
    return _run('decryptMessage', () async {
      final config = jsonEncode({
        'state': stateBase64,
        'envelope': envelope,
      });
      final result = await frb.decryptMessage(configJson: config);
      return jsonDecode(result) as Map<String, dynamic>;
    });
  }

  @override
  Future<String> exportSessionEnvelope({
    required String stateBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) {
    return _run('exportSessionEnvelope', () async {
      final config = jsonEncode({
        'state': stateBase64,
        'user_id': userId,
        'device_id': deviceId,
        'session_id': sessionId,
        'remote_user_id': remoteUserId,
        'remote_device_id': remoteDeviceId,
      });
      final result = await frb.exportSessionEnvelope(configJson: config);
      final parsed = jsonDecode(result) as Map<String, dynamic>;
      return parsed['envelope'] as String;
    });
  }

  @override
  Future<String> restoreSessionEnvelope({
    required String envelopeBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) {
    return _run('restoreSessionEnvelope', () async {
      final config = jsonEncode({
        'envelope': envelopeBase64,
        'user_id': userId,
        'device_id': deviceId,
        'session_id': sessionId,
        'remote_user_id': remoteUserId,
        'remote_device_id': remoteDeviceId,
      });
      final result = await frb.restoreSessionEnvelope(configJson: config);
      final parsed = jsonDecode(result) as Map<String, dynamic>;
      return parsed['state'] as String;
    });
  }

  Future<T> _run<T>(String operation, Future<T> Function() action) async {
    try {
      return await action();
    } catch (error, stackTrace) {
      throw mapRustError(operation, error, stackTrace);
    }
  }
}
