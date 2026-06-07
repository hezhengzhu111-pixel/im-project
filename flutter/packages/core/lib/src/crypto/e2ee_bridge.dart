import 'e2ee_service.dart';

/// High-level E2EE bridge interface used by [E2eeManager].
///
/// Extends [E2eeService] with JSON-based session management methods
/// that operate on base64-encoded strings rather than raw bytes.
/// Platform adapters implement this interface.
abstract class E2eeBridge extends E2eeService {
  /// Generate key bundle and return as JSON with base64-encoded fields.
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount);

  /// Create an outbound session from local keys and a remote bundle.
  Future<Map<String, dynamic>> createOutboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String remoteBundleBase64,
  });

  /// Create an inbound session from local keys and a remote handshake.
  Future<Map<String, dynamic>> createInboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String localSpkPairBase64,
    String? localOtkPairBase64,
    required String remoteIdentityKeyBase64,
    required String remoteHandshakeBase64,
  });

  /// Encrypt a plaintext message within a session.
  Future<Map<String, dynamic>> encryptMessage({
    required String stateBase64,
    required String plaintextBase64,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String sessionId,
    String? handshakeBase64,
  });

  /// Decrypt an E2EE envelope within a session.
  Future<Map<String, dynamic>> decryptMessage({
    required String stateBase64,
    required Map<String, dynamic> envelope,
  });

  /// Export session state as a compact envelope string.
  Future<String> exportSessionEnvelope({
    required String stateBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  });

  /// Restore session state from a compact envelope string.
  Future<String> restoreSessionEnvelope({
    required String envelopeBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  });
}
