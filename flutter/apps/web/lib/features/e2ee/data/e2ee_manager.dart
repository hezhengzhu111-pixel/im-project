import 'dart:convert';
import 'dart:math';

import 'package:im_core/core.dart';
import 'package:im_web/features/e2ee/data/e2ee_api.dart';
import 'package:im_web/features/e2ee/data/e2ee_key_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_meta_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_session_store.dart';

/// Core E2EE orchestrator.
///
/// Thin wrapper over the Rust SessionManager (via [WebE2eeAdapter]).
/// Handles: negotiation flow, storage coordination, device registration.
class E2eeManager {
  E2eeManager({
    required this.adapter,
    required this.api,
    required this.keyStore,
    required this.sessionStore,
    required this.metaStore,
    required this.currentUserId,
  });

  final E2eeBridge adapter;
  final E2eeApi api;
  final E2eeKeyStore keyStore;
  final E2eeSessionStore sessionStore;
  final E2eeMetaStore metaStore;
  final String currentUserId;

  static const _otkCount = 100;
  static const _otkReplenishThreshold = 20;

  late String _deviceId;
  bool _initialized = false;
  Future<void>? _initFuture;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /// Initialize stores and set device ID.
  Future<void> init() async {
    if (_initialized) return;
    final existingInit = _initFuture;
    if (existingInit != null) {
      await existingInit;
      return;
    }
    _initFuture = _doInit();
    await _initFuture;
  }

  Future<void> _doInit() async {
    await keyStore.init();
    await sessionStore.init();
    _deviceId = await metaStore.getOrCreateDeviceId();
    _initialized = true;
  }

  // ---------------------------------------------------------------------------
  // Device Registration
  // ---------------------------------------------------------------------------

  /// Check if key material exists in KeyStore.
  /// - If not: generate 100 OTKs via FRB, upload to server, save to IndexedDB,
  ///   clear old sessions.
  /// - If yes: heartbeat + replenish OTK if < 20.
  Future<String> ensureDeviceRegistered() async {
    await init();

    final existingKeys = await keyStore.getKeyMaterial();

    if (existingKeys == null) {
      // Generate fresh key bundle via FRB.
      final bundleJson = await adapter.generateKeyBundleJson(_otkCount);

      // Store full key material (JSON) in IndexedDB.
      await keyStore.saveKeyMaterial(jsonEncode(bundleJson));
      await keyStore.saveDeviceId(_deviceId);

      // Extract and store the public bundle separately for quick access.
      final publicBundle = bundleJson['public_bundle'] as Map<String, dynamic>;
      await keyStore.savePublicBundle(jsonEncode(publicBundle));

      // Upload public bundle to server.
      final otkPairs = bundleJson['otk_pairs'] as List<dynamic>;
      final publishedIds = otkPairs
          .map((otk) => (otk as Map<String, dynamic>)['id'] as int)
          .toList();

      await api.uploadBundle({
        'deviceId': _deviceId,
        'identityKey': publicBundle['identity_key'],
        'signingIdentityKey': publicBundle['signing_key'],
        'signedPreKey':
            (publicBundle['signed_pre_key'] as Map<String, dynamic>)['key'],
        'signedPreKeySignature': publicBundle['signed_pre_key_signature'],
        'oneTimePreKeys': publicBundle['one_time_pre_keys'],
      });

      await metaStore.setPublishedOtkIds(_deviceId, publishedIds);

      // New key material invalidates all existing sessions.
      await sessionStore.clearAll();
    } else {
      // Device already registered — heartbeat + OTK replenishment.
      try {
        await api.heartbeat();
      } catch (_) {
        // Heartbeat failure is non-fatal; continue with local state.
      }

      // Replenish OTKs when running low.
      final keyMaterial = jsonDecode(existingKeys) as Map<String, dynamic>;
      final otkPairs = keyMaterial['otk_pairs'] as List<dynamic>? ?? [];

      if (otkPairs.length < _otkReplenishThreshold) {
        try {
          final freshBundle = await adapter.generateKeyBundleJson(_otkCount);

          // Merge fresh OTKs into existing key material, preserving identity + SPK.
          keyMaterial['otk_pairs'] = freshBundle['otk_pairs'];
          final publicBundle =
              keyMaterial['public_bundle'] as Map<String, dynamic>;
          publicBundle['one_time_pre_keys'] = (freshBundle['public_bundle']
              as Map<String, dynamic>)['one_time_pre_keys'];

          await keyStore.saveKeyMaterial(jsonEncode(keyMaterial));
          await keyStore.savePublicBundle(jsonEncode(publicBundle));

          final newOtkIds = (freshBundle['otk_pairs'] as List<dynamic>)
              .map((otk) => (otk as Map<String, dynamic>)['id'] as int)
              .toList();
          await api.uploadBundle({
            'deviceId': _deviceId,
            'identityKey': publicBundle['identity_key'],
            'signingIdentityKey': publicBundle['signing_key'],
            'signedPreKey':
                (publicBundle['signed_pre_key'] as Map<String, dynamic>)['key'],
            'signedPreKeySignature': publicBundle['signed_pre_key_signature'],
            'oneTimePreKeys': publicBundle['one_time_pre_keys'],
          });
          await metaStore.setPublishedOtkIds(_deviceId, newOtkIds);
        } catch (_) {
          // OTK replenishment failure is non-fatal.
        }
      }
    }

    return _deviceId;
  }

  // ---------------------------------------------------------------------------
  // Negotiation — Alice (initiator) side
  // ---------------------------------------------------------------------------

  /// Initiate E2EE negotiation with a peer.
  ///
  /// Flow: clear old state -> set status negotiating -> ensure device registered
  /// -> get remote bundle -> create outbound session via FRB -> save session state
  /// -> generate verify phrase -> save handshake -> send request to server.
  Future<bool> initiateNegotiation(String sessionId, String peerId) async {
    await init();

    // Clear old state.
    await _resetNegotiation(sessionId, 'negotiating');

    try {
      await api.disableEncryption(sessionId);
    } catch (_) {
      // Server may not have a session yet.
    }

    await metaStore.setSessionStatus(sessionId, 'negotiating');

    try {
      await ensureDeviceRegistered();
      final localKeys = await _getLocalKeyMaterial();

      // Fetch remote bundle from server.
      final remoteBundle = await api.getBundle(peerId);
      final remoteDeviceId = (remoteBundle['deviceId'] as String?) ?? '';
      if (remoteDeviceId.isEmpty) {
        throw Exception('remote user has no active E2EE device');
      }

      // Build PreKeyBundleFetch for FRB.
      final remoteBundleForFrb = _buildRemoteBundleJson(remoteBundle);
      final identityKeyPairBincode =
          localKeys['identity_key_pair_bincode'] as String;

      // Create outbound session via FRB.
      final outboundResult = await adapter.createOutboundSession(
        sessionId: sessionId,
        localIdentityKeyPairBase64: identityKeyPairBincode,
        remoteBundleBase64:
            base64Encode(utf8.encode(jsonEncode(remoteBundleForFrb))),
      );

      // Save session state as v3 envelope.
      final stateBase64 = outboundResult['state'] as String;
      final envelopeBase64 = await adapter.exportSessionEnvelope(
        stateBase64: stateBase64,
        userId: currentUserId,
        deviceId: _deviceId,
        sessionId: sessionId,
        remoteUserId: peerId,
        remoteDeviceId: remoteDeviceId,
      );
      await sessionStore.saveSession(sessionId, envelopeBase64);
      await metaStore.setRemoteDeviceId(sessionId, remoteDeviceId);

      // Generate and save verify phrase.
      final verifyPhrase = _generateVerifyPhrase();
      await metaStore.setVerifyPhrase(sessionId, verifyPhrase);

      // Save pending handshake.
      final handshake = outboundResult['handshake'] as String;
      final identityKey = (localKeys['public_bundle']
          as Map<String, dynamic>)['identity_key'] as String;
      final handshakePayload = jsonEncode({
        'senderIdentityKey': identityKey,
        'handshake': handshake,
        'senderDeviceId': _deviceId,
        'targetDeviceId': remoteDeviceId,
      });
      await metaStore.setPendingHandshake(sessionId, handshakePayload);

      // Send request to server.
      final signedPreKey = (localKeys['public_bundle']
          as Map<String, dynamic>)['signed_pre_key'] as Map<String, dynamic>;
      await api.requestEncryption(
        sessionId: sessionId,
        identityKey: identityKey,
        signedPreKey: signedPreKey['key'] as String,
        requestPayloadJson: jsonEncode({
          'senderIdentityKey': identityKey,
          'handshake': handshake,
          'senderDeviceId': _deviceId,
          'targetDeviceId': remoteDeviceId,
          'verifyPhrase': verifyPhrase,
        }),
      );

      await metaStore.setSessionStatus(sessionId, 'negotiating');
      return true;
    } catch (e) {
      await metaStore.clearPendingHandshake(sessionId);
      await metaStore.setSessionStatus(sessionId, 'failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Negotiation — Bob (responder) side
  // ---------------------------------------------------------------------------

  /// Respond to an incoming E2EE negotiation request.
  ///
  /// Flow: parse handshake from payload -> create inbound session via FRB
  /// -> save session state -> set status encrypted -> accept on server.
  Future<bool> respondToNegotiation(
    String sessionId,
    Map<String, dynamic> requestPayload,
  ) async {
    await init();

    final senderDeviceId = requestPayload['senderDeviceId'] as String? ?? '';
    final targetDeviceId = requestPayload['targetDeviceId'] as String? ?? '';
    final senderIdentityKey =
        requestPayload['senderIdentityKey'] as String? ?? '';
    final handshake = requestPayload['handshake'] as String? ?? '';
    final senderUserId = requestPayload['senderUserId'] as String? ?? '';
    final verifyPhrase = requestPayload['verifyPhrase'] as String?;

    if (senderDeviceId.isEmpty || targetDeviceId.isEmpty) {
      await metaStore.setSessionStatus(sessionId, 'failed');
      return false;
    }

    await metaStore.setSessionStatus(sessionId, 'negotiating');

    try {
      await ensureDeviceRegistered();

      if (_deviceId != targetDeviceId) {
        throw Exception('negotiation request targets a different device');
      }

      final localKeys = await _getLocalKeyMaterial();
      final identityKeyPairBincode =
          localKeys['identity_key_pair_bincode'] as String;
      final signedPreKeyPairBincode =
          localKeys['signed_pre_key_pair_bincode'] as String;

      // Find the OTK pair matching the handshake.
      final otkPairs = localKeys['otk_pairs'] as List<dynamic>;
      String? otkPairBincode;
      // Parse handshake to extract OTK ID (last 4 bytes of 40-byte handshake).
      final handshakeBytes = base64Decode(handshake);
      if (handshakeBytes.length == 40) {
        final otkId = (handshakeBytes[36] << 24) |
            (handshakeBytes[37] << 16) |
            (handshakeBytes[38] << 8) |
            handshakeBytes[39];
        if (otkId != 0xffffffff) {
          for (final otk in otkPairs) {
            if ((otk as Map<String, dynamic>)['id'] == otkId) {
              otkPairBincode = otk['key_pair_bincode'] as String;
              break;
            }
          }
        }
      }

      // Create inbound session via FRB.
      final inboundResult = await adapter.createInboundSession(
        sessionId: sessionId,
        localIdentityKeyPairBase64: identityKeyPairBincode,
        localSpkPairBase64: signedPreKeyPairBincode,
        localOtkPairBase64: otkPairBincode,
        remoteIdentityKeyBase64: senderIdentityKey,
        remoteHandshakeBase64: handshake,
      );

      // Save session state as v3 envelope.
      final stateBase64 = inboundResult['state'] as String;
      final envelopeBase64 = await adapter.exportSessionEnvelope(
        stateBase64: stateBase64,
        userId: currentUserId,
        deviceId: _deviceId,
        sessionId: sessionId,
        remoteUserId: senderUserId,
        remoteDeviceId: senderDeviceId,
      );
      await sessionStore.saveSession(sessionId, envelopeBase64);
      await metaStore.setRemoteDeviceId(sessionId, senderDeviceId);

      if (verifyPhrase != null && verifyPhrase.isNotEmpty) {
        await metaStore.setVerifyPhrase(sessionId, verifyPhrase);
      }

      await metaStore.setSessionStatus(sessionId, 'encrypted');

      // Accept on server.
      final publicBundle = localKeys['public_bundle'] as Map<String, dynamic>;
      final spk = publicBundle['signed_pre_key'] as Map<String, dynamic>;
      try {
        await api.acceptEncryption(
          sessionId: sessionId,
          signedPreKey: spk['key'] as String,
        );
      } catch (_) {
        // Session is already established locally; do not fail.
      }

      return true;
    } catch (e) {
      await metaStore.setSessionStatus(sessionId, 'failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Encrypt / Decrypt
  // ---------------------------------------------------------------------------

  /// Encrypt plaintext to an E2EE envelope.
  ///
  /// Loads session -> restore state -> encrypt via FRB -> save new state
  /// -> return envelope (without `new_state` field).
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    await init();

    final envelopeBase64 = await sessionStore.getSession(sessionId);
    if (envelopeBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }

    final remoteDeviceId = await metaStore.getRemoteDeviceId(sessionId);
    if (remoteDeviceId == null || remoteDeviceId.isEmpty) {
      throw Exception('remote device ID not set for session $sessionId');
    }

    final remoteUserId = _extractPeerId(sessionId);

    // Restore session state from v3 envelope.
    final stateBase64 = await adapter.restoreSessionEnvelope(
      envelopeBase64: envelopeBase64,
      userId: currentUserId,
      deviceId: senderDeviceId,
      sessionId: sessionId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );

    // Encrypt via FRB.
    final plaintextBase64 = base64Encode(utf8.encode(plaintext));
    final result = await adapter.encryptMessage(
      stateBase64: stateBase64,
      plaintextBase64: plaintextBase64,
      senderDeviceId: senderDeviceId,
      recipientDeviceId: recipientDeviceId,
      sessionId: sessionId,
    );

    // Save updated session state.
    final newStateBase64 = result['new_state'] as String;
    final newEnvelopeBase64 = await adapter.exportSessionEnvelope(
      stateBase64: newStateBase64,
      userId: currentUserId,
      deviceId: senderDeviceId,
      sessionId: sessionId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );
    await sessionStore.saveSession(sessionId, newEnvelopeBase64);

    // Return envelope without new_state (internal state must not leak).
    final envelope = Map<String, dynamic>.from(result);
    envelope.remove('new_state');
    return envelope;
  }

  /// Decrypt an E2EE envelope to plaintext.
  ///
  /// Loads session -> restore state -> decrypt via FRB -> save new state
  /// -> return plaintext.
  Future<String> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
  }) async {
    await init();

    final senderDeviceId = envelope['sender_device_id'] as String? ?? '';
    final localDeviceId = _deviceId;

    final envelopeBase64 = await sessionStore.getSession(sessionId);
    if (envelopeBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }

    // Restore session state from v3 envelope.
    final stateBase64 = await adapter.restoreSessionEnvelope(
      envelopeBase64: envelopeBase64,
      userId: currentUserId,
      deviceId: localDeviceId,
      sessionId: sessionId,
      remoteUserId: _extractPeerId(sessionId),
      remoteDeviceId: senderDeviceId,
    );

    // Decrypt via FRB.
    final result = await adapter.decryptMessage(
      stateBase64: stateBase64,
      envelope: envelope,
    );

    // Save updated session state.
    final newStateBase64 = result['new_state'] as String;
    final newEnvelopeBase64 = await adapter.exportSessionEnvelope(
      stateBase64: newStateBase64,
      userId: currentUserId,
      deviceId: localDeviceId,
      sessionId: sessionId,
      remoteUserId: _extractPeerId(sessionId),
      remoteDeviceId: senderDeviceId,
    );
    await sessionStore.saveSession(sessionId, newEnvelopeBase64);

    // Decode plaintext.
    final plaintextBase64 = result['plaintext'] as String;
    return utf8.decode(base64Decode(plaintextBase64));
  }

  // ---------------------------------------------------------------------------
  // Exit Encryption
  // ---------------------------------------------------------------------------

  /// Delete session + clear metadata + disable on server.
  Future<void> exitEncryption(String sessionId) async {
    await init();

    await sessionStore.deleteSession(sessionId);
    await metaStore.clearSession(sessionId);

    try {
      await api.disableEncryption(sessionId);
    } catch (_) {
      // Server may not have a session record.
    }
  }

  /// Load server-side pending negotiation requests for the current user.
  Future<List<E2eeNegotiationEvent>> getPendingNegotiations() async {
    await init();
    return api.getPendingNegotiations();
  }

  /// Reject an incoming negotiation and clear local transient state.
  Future<void> rejectNegotiation(String sessionId) async {
    await init();

    await _resetNegotiation(sessionId, 'plaintext');

    try {
      await api.rejectEncryption(sessionId);
    } catch (_) {
      // Local state is authoritative for the UI; server failures are surfaced
      // by callers that need stricter handling.
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /// Load key material JSON from IndexedDB.
  Future<Map<String, dynamic>> _getLocalKeyMaterial() async {
    final raw = await keyStore.getKeyMaterial();
    if (raw == null) {
      throw Exception('local E2EE key material not found');
    }
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  /// Build the PreKeyBundleFetch JSON expected by the FRB bridge.
  ///
  /// The FRB `create_outbound_session` expects `remote_bundle` as a
  /// base64-encoded bincode `PreKeyBundleFetch`. However, the server returns
  /// the bundle as a flat JSON object. We reconstruct the bincode on the Rust
  /// side by passing the JSON fields through the adapter.
  Map<String, dynamic> _buildRemoteBundleJson(Map<String, dynamic> raw) {
    final identityKey = (raw['identityKey'] as String?) ?? '';
    final signingKey = (raw['signingIdentityKey'] as String?) ??
        (raw['signingKey'] as String?) ??
        identityKey;
    final spkString = (raw['signedPreKey'] as String?) ?? '';
    final spkSignature = (raw['signedPreKeySignature'] as String?) ?? '';
    final otkString = raw['oneTimePreKey'] as String?;
    final otkId = raw['oneTimePreKeyId'] as int?;

    return {
      'identityKey': identityKey,
      'signingKey': signingKey,
      'signedPreKey': {'id': 1, 'key': spkString},
      'signedPreKeySignature': spkSignature,
      'oneTimePreKey':
          (otkString != null && otkString.isNotEmpty && otkId != null)
              ? {'id': otkId, 'key': otkString}
              : null,
    };
  }

  /// Reset negotiation state for a session.
  Future<void> _resetNegotiation(
    String sessionId, [
    String status = 'plaintext',
  ]) async {
    await metaStore.clearPendingHandshake(sessionId);
    await sessionStore.deleteSession(sessionId);
    await metaStore.setSessionStatus(sessionId, status);
  }

  /// Extract the peer user ID from a session ID.
  ///
  /// Session ID format: `{userId}_private_{targetId}`.
  /// Returns the targetId portion.
  String _extractPeerId(String sessionId) {
    final parts = sessionId.split('_private_');
    if (parts.length == 2) {
      return parts[0] == currentUserId ? parts[1] : parts[0];
    }
    // Fallback: try to extract from any known separator.
    return sessionId;
  }

  /// Generate a 6-digit verify phrase (same as Vue frontend).
  String _generateVerifyPhrase() {
    final rng = Random.secure();
    return (rng.nextInt(1000000)).toString().padLeft(6, '0');
  }
}
