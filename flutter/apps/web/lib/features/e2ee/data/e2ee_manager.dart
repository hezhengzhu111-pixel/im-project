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
  final String? currentUserId;

  static const _otkCount = 100;
  static const _otkReplenishThreshold = 20;

  late String _deviceId;
  bool _initialized = false;
  Future<void>? _initFuture;

  /// Track sessions currently loaded in the WASM runtime to avoid duplicate
  /// restore. Matches Vue's `loadedSessions` Set.
  final _loadedSessions = <String>{};

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

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
        await api.heartbeatDevice(_deviceId);
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
      final targetDevice = await _newestRemoteDevice(peerId);
      final remoteDeviceId = targetDevice['deviceId'] as String;
      if (remoteDeviceId.isEmpty) {
        throw Exception('remote user has no active E2EE device');
      }

      // Fetch remote bundle from server.
      final remoteBundle = await api.getBundle(
        peerId,
        deviceId: remoteDeviceId,
        conversationId: sessionId,
        requesterDeviceId: _deviceId,
      );
      final resolvedRemoteDeviceId = remoteBundle['deviceId'] as String;

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
      await sessionStore.saveSession(
        sessionId: sessionId,
        stateBase64: stateBase64,
        localDeviceId: _deviceId,
        remoteUserId: peerId,
        remoteDeviceId: resolvedRemoteDeviceId,
        direction: 'outbound',
      );
      await metaStore.setRemoteDeviceId(sessionId, resolvedRemoteDeviceId);

      // Track in memory (match Vue loadedSessions).
      _loadedSessions.add(sessionId);

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
        'targetDeviceId': resolvedRemoteDeviceId,
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
          'targetDeviceId': resolvedRemoteDeviceId,
          'verifyPhrase': verifyPhrase,
        }),
      );

      await metaStore.setSessionStatus(sessionId, 'negotiating');
      return true;
    } catch (e, st) {
      // ignore: avoid_print
      print('[e2ee] initiateNegotiation FAILED: $e\n$st');
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

      final consumedOtkId = inboundResult['otk_id'] as int?;
      if (consumedOtkId != null) {
        await keyStore.markOneTimePreKeyConsumed(consumedOtkId);
      }

      // Save session state as v3 envelope.
      final stateBase64 = inboundResult['state'] as String;
      await sessionStore.saveSession(
        sessionId: sessionId,
        stateBase64: stateBase64,
        localDeviceId: _deviceId,
        remoteUserId: senderUserId,
        remoteDeviceId: senderDeviceId,
        direction: 'inbound',
      );
      await metaStore.setRemoteDeviceId(sessionId, senderDeviceId);

      // Track in memory (match Vue loadedSessions).
      _loadedSessions.add(sessionId);

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

    final remoteDeviceId = await metaStore.getRemoteDeviceId(sessionId);
    if (remoteDeviceId == null || remoteDeviceId.isEmpty) {
      throw Exception('remote device ID not set for session $sessionId');
    }

    final remoteUserId = _extractPeerId(sessionId);

    // Get stored session state from IndexedDB.
    final stateBase64 = await sessionStore.getSession(
      sessionId: sessionId,
      localDeviceId: senderDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );

    if (stateBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }

    // Encrypt via FRB.
    final plaintextBase64 = base64Encode(utf8.encode(plaintext));
    final result = await adapter.encryptMessage(
      stateBase64: stateBase64,
      plaintextBase64: plaintextBase64,
      senderDeviceId: senderDeviceId,
      recipientDeviceId: recipientDeviceId,
      sessionId: sessionId,
    );

    // Save updated session state as v3 envelope.
    final newStateBase64 = result['new_state'] as String;
    await sessionStore.saveSession(
      sessionId: sessionId,
      stateBase64: newStateBase64,
      localDeviceId: senderDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
      direction: 'outbound',
    );

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
    final remoteUserId = _extractPeerId(sessionId);

    // Get stored session state from IndexedDB.
    final stateBase64 = await sessionStore.getSession(
      sessionId: sessionId,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: senderDeviceId,
    );

    if (stateBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }

    // Decrypt via FRB.
    final result = await adapter.decryptMessage(
      stateBase64: stateBase64,
      envelope: envelope,
    );

    // Save updated session state as v3 envelope.
    final newStateBase64 = result['new_state'] as String;
    await sessionStore.saveSession(
      sessionId: sessionId,
      stateBase64: newStateBase64,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: senderDeviceId,
      direction: 'inbound',
    );

    // Track in memory.
    _loadedSessions.add(sessionId);

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
    _loadedSessions.remove(sessionId);

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

  /// Reconcile local E2EE state with the server-side negotiation state.
  ///
  /// This is the recovery path for devices that missed websocket negotiation
  /// events while offline. It never recreates cryptographic state in Dart; it
  /// only exposes locally persisted Rust session state when the server confirms
  /// the channel is encrypted, or purges stale local state when the server says
  /// the channel has been disabled/rejected.
  Future<String> syncSessionStatus(String sessionId) async {
    await init();

    try {
      final remote = await api.getSessionStatus(sessionId);
      final remoteStatus = remote['status']?.toString() ?? 'plaintext';

      if (remoteStatus == 'encrypted') {
        final existingRemoteDeviceId =
            await metaStore.getRemoteDeviceId(sessionId);
        if (existingRemoteDeviceId != null &&
            existingRemoteDeviceId.isNotEmpty) {
          final stateBase64 = await sessionStore.getSession(
            sessionId: sessionId,
            localDeviceId: _deviceId,
            remoteUserId: _extractPeerId(sessionId),
            remoteDeviceId: existingRemoteDeviceId,
          );
          if (stateBase64 != null) {
            await metaStore.setSessionStatus(sessionId, 'encrypted');
            _loadedSessions.add(sessionId);
            return 'encrypted';
          }
        }

        final recovered = await sessionStore.findSessionByLocalDevice(
          sessionId: sessionId,
          localDeviceId: _deviceId,
        );
        if (recovered != null && recovered.remoteDeviceId.isNotEmpty) {
          await metaStore.setRemoteDeviceId(
            sessionId,
            recovered.remoteDeviceId,
          );
          await metaStore.setSessionStatus(sessionId, 'encrypted');
          _loadedSessions.add(sessionId);
          return 'encrypted';
        }

        await metaStore.setSessionStatus(sessionId, 'failed');
        return 'failed';
      }

      if (remoteStatus == 'pending') {
        await metaStore.setSessionStatus(sessionId, 'negotiating');
        return 'negotiating';
      }

      if (remoteStatus == 'plaintext' || remoteStatus == 'rejected') {
        await sessionStore.deleteSession(sessionId);
        await metaStore.clearSession(sessionId);
        await metaStore.setSessionStatus(sessionId, 'plaintext');
        _loadedSessions.remove(sessionId);
        return 'plaintext';
      }

      await metaStore.setSessionStatus(sessionId, 'failed');
      return 'failed';
    } catch (_) {
      return metaStore.getSessionStatus(sessionId);
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
    final identityKey = raw['identityKey'] as String;
    final signingKey = raw['signingIdentityKey'] as String;
    final spkString = raw['signedPreKey'] as String;
    final spkSignature = raw['signedPreKeySignature'] as String;
    final otkString = raw['oneTimePreKey'] as String?;
    final otkId = raw['oneTimePreKeyId'] as int?;

    return {
      'identity_key': identityKey,
      'signing_key': signingKey,
      'signed_pre_key': {'id': 1, 'key': spkString},
      'signed_pre_key_signature': spkSignature,
      'one_time_pre_key':
          (otkString != null && otkString.isNotEmpty && otkId != null)
              ? {'id': otkId, 'key': otkString}
              : null,
    };
  }

  Future<Map<String, dynamic>> _newestRemoteDevice(String userId) async {
    final devices = await api.getDevices(userId);
    devices.sort((a, b) {
      final left = DateTime.tryParse(a['lastActiveAt'] as String)
              ?.millisecondsSinceEpoch ??
          0;
      final right = DateTime.tryParse(b['lastActiveAt'] as String)
              ?.millisecondsSinceEpoch ??
          0;
      return right.compareTo(left);
    });
    if (devices.isEmpty || (devices.first['deviceId'] as String).isEmpty) {
      throw Exception('remote user has no active E2EE device');
    }
    return devices.first;
  }

  /// Reset negotiation state for a session.
  Future<void> _resetNegotiation(
    String sessionId, [
    String status = 'plaintext',
  ]) async {
    await metaStore.clearPendingHandshake(sessionId);
    await sessionStore.deleteSession(sessionId);
    await metaStore.setSessionStatus(sessionId, status);
    _loadedSessions.remove(sessionId);
  }

  /// Extract the peer user ID from a session ID.
  ///
  /// Session ID format: `p_{id_a}_{id_b}`.
  /// Returns the targetId portion.
  String _extractPeerId(String sessionId) {
    final parts = sessionId.startsWith('p_')
        ? sessionId.substring(2).split('_')
        : sessionId.split('_');
    if (parts.length == 2) {
      if (currentUserId == null) {
        throw StateError('currentUserId is null, cannot determine peer');
      }
      return parts[0] == currentUserId ? parts[1] : parts[0];
    }
    throw FormatException('invalid E2EE private session id', sessionId);
  }

  /// Generate a 6-digit verify phrase (same as Vue frontend).
  String _generateVerifyPhrase() {
    final rng = Random.secure();
    return (rng.nextInt(1000000)).toString().padLeft(6, '0');
  }
}
