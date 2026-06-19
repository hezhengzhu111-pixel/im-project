import 'dart:convert';
import 'dart:math';

import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'e2ee_api.dart';
import 'e2ee_key_store.dart';
import 'e2ee_meta_store.dart';
import 'e2ee_session_store.dart';

/// Core E2EE orchestrator.
///
/// Thin wrapper over the Rust SessionManager (via [E2eeBridge]).
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

  /// Track sessions currently loaded in the runtime to avoid duplicate
  /// restore.
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
  /// - If not: generate 100 OTKs via FRB, upload to server, save to local
  ///   storage, clear old sessions.
  /// - If yes: heartbeat + replenish OTK if < 20.
  Future<String> ensureDeviceRegistered() async {
    await init();

    final existingKeys = await keyStore.getKeyMaterial();

    if (existingKeys == null) {
      await _registerFreshDevice(resetDeviceId: false);
    } else {
      // Device already registered -- heartbeat + OTK replenishment.
      try {
        await api.heartbeatDevice(_deviceId);
      } catch (e) {
        if (_isDeviceRegistrationRejected(e)) {
          await _registerFreshDevice(resetDeviceId: true);
          return _deviceId;
        }
        // Transient heartbeat failures are non-fatal; continue with local state.
      }

      try {
        await _refillOpkIfServerLow(existingKeys);
      } catch (e) {
        if (_isDeviceRegistrationRejected(e)) {
          await _registerFreshDevice(resetDeviceId: true);
          return _deviceId;
        }
        // OPK replenishment failure is non-fatal; the server will use SPK fallback.
      }
    }

    return _deviceId;
  }

  Future<void> _registerFreshDevice({required bool resetDeviceId}) async {
    if (resetDeviceId) {
      await keyStore.clearAll();
      await metaStore.clearDeviceId();
      _deviceId = await metaStore.getOrCreateDeviceId();
      _loadedSessions.clear();
    }

    // Generate fresh key bundle via FRB.
    final bundleJson = await adapter.generateKeyBundleJson(_otkCount);

    // Store full key material (JSON) in local storage.
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
    await metaStore.setMaxPublishedOtkId(
      _deviceId,
      publishedIds.reduce((a, b) => a > b ? a : b),
    );

    // New key material invalidates all existing sessions.
    await sessionStore.clearAll();
  }

  Future<void> _refillOpkIfServerLow(String existingKeys) async {
    try {
      final status = await api.getOpkStatus(_deviceId);
      final isLow = status['lowWatermark'] as bool? ?? false;
      final count = status['count'] as int? ?? 0;
      if (!isLow && count >= _otkReplenishThreshold) return;

      final keyMaterial = jsonDecode(existingKeys) as Map<String, dynamic>;
      final freshBundle = await adapter.generateKeyBundleJson(_otkCount);

      final existingOtkPairs = List<dynamic>.from(
        keyMaterial['otk_pairs'] as List<dynamic>? ?? const [],
      );
      final existingPublicBundle =
          keyMaterial['public_bundle'] as Map<String, dynamic>;
      final existingPublicOpks = List<dynamic>.from(
        existingPublicBundle['one_time_pre_keys'] as List<dynamic>? ?? const [],
      );

      final freshOtkPairs = List<dynamic>.from(
        freshBundle['otk_pairs'] as List<dynamic>? ?? const [],
      );
      final freshPublicBundle =
          freshBundle['public_bundle'] as Map<String, dynamic>;
      final freshPublicOpks = List<dynamic>.from(
        freshPublicBundle['one_time_pre_keys'] as List<dynamic>? ?? const [],
      );

      // The Rust bridge always numbers fresh OTKs from 1. Renumber them so
      // they continue after the highest ID already published for this device.
      final maxPublishedId = await metaStore.getMaxPublishedOtkId(_deviceId);
      final idMapping = <int, int>{};
      for (var i = 0; i < freshOtkPairs.length; i++) {
        final oldId = (freshOtkPairs[i] as Map<String, dynamic>)['id'] as int;
        idMapping[oldId] = maxPublishedId + 1 + i;
      }

      Map<String, dynamic> renumberOtk(Map<String, dynamic> otk) {
        final newId = idMapping[otk['id'] as int];
        if (newId == null) return otk;
        final renamed = Map<String, dynamic>.from(otk);
        renamed['id'] = newId;
        return renamed;
      }

      final renumberedOtkPairs =
          freshOtkPairs.cast<Map<String, dynamic>>().map(renumberOtk).toList();
      final renumberedPublicOpks = freshPublicOpks
          .cast<Map<String, dynamic>>()
          .map(renumberOtk)
          .toList();

      keyMaterial['otk_pairs'] = [...existingOtkPairs, ...renumberedOtkPairs];
      existingPublicBundle['one_time_pre_keys'] = [
        ...existingPublicOpks,
        ...renumberedPublicOpks
      ];

      await keyStore.saveKeyMaterial(jsonEncode(keyMaterial));
      await keyStore.savePublicBundle(jsonEncode(existingPublicBundle));
      await api.refillOpk({
        'deviceId': _deviceId,
        'oneTimePreKeys': renumberedPublicOpks,
      });

      final newMaxId = maxPublishedId + freshOtkPairs.length;
      await metaStore.setMaxPublishedOtkId(_deviceId, newMaxId);
      final existingPublishedIds =
          await metaStore.getPublishedOtkIds(_deviceId);
      await metaStore.setPublishedOtkIds(
        _deviceId,
        [
          ...existingPublishedIds,
          ...renumberedPublicOpks.map((otk) => otk['id'] as int)
        ],
      );
    } catch (e) {
      if (_isDeviceRegistrationRejected(e)) rethrow;
    }
  }

  bool _isDeviceRegistrationRejected(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('status code of 403') ||
        text.contains('status=403') ||
        text.contains(' 403') ||
        text.contains('forbidden') ||
        text.contains('status code of 404') ||
        text.contains('status=404') ||
        text.contains(' 404') ||
        text.contains('device not found') ||
        text.contains('device does not belong');
  }

  // ---------------------------------------------------------------------------
  // Negotiation -- Alice (initiator) side
  // ---------------------------------------------------------------------------

  /// Initiate E2EE negotiation with a peer.
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
      final senderUserId = currentUserId?.trim() ?? '';
      if (senderUserId.isEmpty) {
        throw StateError('currentUserId is required to initiate E2EE');
      }
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

      // Save session state as a context-bound envelope.
      final stateBase64 = outboundResult['state'] as String;
      final envelopeBase64 = await _exportSessionState(
        sessionId: sessionId,
        localDeviceId: _deviceId,
        remoteUserId: peerId,
        remoteDeviceId: resolvedRemoteDeviceId,
        stateBase64: stateBase64,
      );
      await sessionStore.saveSession(
        sessionId: sessionId,
        stateBase64: envelopeBase64,
        localDeviceId: _deviceId,
        remoteUserId: peerId,
        remoteDeviceId: resolvedRemoteDeviceId,
        direction: 'outbound',
      );
      await metaStore.setRemoteDeviceId(sessionId, resolvedRemoteDeviceId);
      await metaStore.setRemoteUserId(sessionId, peerId);

      // Track in memory.
      _loadedSessions.add(sessionId);

      // Generate and save verify phrase.
      final verifyPhrase = _generateVerifyPhrase();
      await metaStore.setVerifyPhrase(sessionId, verifyPhrase);

      // Save pending handshake.
      final handshake = outboundResult['handshake'] as String;
      final identityKey = (localKeys['public_bundle']
          as Map<String, dynamic>)['identity_key'] as String;
      final handshakePayload = jsonEncode({
        'senderUserId': senderUserId,
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
          'senderUserId': senderUserId,
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
      AppLogger.instance
          .error('Failed to initiate E2EE negotiation', e, st, 'e2ee');
      await metaStore.clearPendingHandshake(sessionId);
      await metaStore.setSessionStatus(sessionId, 'failed');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Negotiation -- Bob (responder) side
  // ---------------------------------------------------------------------------

  /// Respond to an incoming E2EE negotiation request.
  Future<bool> respondToNegotiation(
    String sessionId,
    Map<String, dynamic> requestPayload,
  ) async {
    await init();

    final senderDeviceId = _firstString(
            requestPayload, const ['senderDeviceId', 'sender_device_id']) ??
        '';
    final targetDeviceId = _firstString(
            requestPayload, const ['targetDeviceId', 'target_device_id']) ??
        '';
    final senderIdentityKey = _firstString(
          requestPayload,
          const ['senderIdentityKey', 'sender_identity_key'],
        ) ??
        '';
    final handshake = _firstString(requestPayload, const ['handshake']) ?? '';
    final String senderUserId;
    try {
      senderUserId = _firstString(
            requestPayload,
            const [
              'senderUserId',
              'sender_user_id',
              'requesterId',
              'requester_id',
            ],
          ) ??
          _extractPeerId(sessionId);
    } catch (_) {
      await metaStore.setSessionStatus(sessionId, 'failed');
      return false;
    }
    final verifyPhrase =
        _firstString(requestPayload, const ['verifyPhrase', 'verify_phrase']);

    if (senderDeviceId.isEmpty ||
        targetDeviceId.isEmpty ||
        senderUserId.isEmpty) {
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

      // Save session state as a context-bound envelope.
      final stateBase64 = inboundResult['state'] as String;
      final envelopeBase64 = await _exportSessionState(
        sessionId: sessionId,
        localDeviceId: _deviceId,
        remoteUserId: senderUserId,
        remoteDeviceId: senderDeviceId,
        stateBase64: stateBase64,
      );
      await sessionStore.saveSession(
        sessionId: sessionId,
        stateBase64: envelopeBase64,
        localDeviceId: _deviceId,
        remoteUserId: senderUserId,
        remoteDeviceId: senderDeviceId,
        direction: 'inbound',
      );
      await metaStore.setRemoteDeviceId(sessionId, senderDeviceId);
      await metaStore.setRemoteUserId(sessionId, senderUserId);

      // Track in memory.
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

    // Get stored session state and unwrap the context-bound envelope.
    final storedBase64 = await sessionStore.getSession(
      sessionId: sessionId,
      localDeviceId: senderDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );

    if (storedBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }
    final stateBase64 = await _restoreSessionState(
      sessionId: sessionId,
      localDeviceId: senderDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
      envelopeBase64: storedBase64,
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

    // Save updated session state as a context-bound envelope.
    final newStateBase64 = result['new_state'] as String;
    final newEnvelopeBase64 = await _exportSessionState(
      sessionId: sessionId,
      localDeviceId: senderDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
      stateBase64: newStateBase64,
    );
    await sessionStore.saveSession(
      sessionId: sessionId,
      stateBase64: newEnvelopeBase64,
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
  Future<String> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
  }) async {
    await init();

    final normalizedEnvelope = _normalizeEnvelopeForRust(envelope);
    final senderDeviceId = _firstString(
          normalizedEnvelope,
          const ['sender_device_id', 'senderDeviceId'],
        ) ??
        '';
    if (senderDeviceId.isEmpty) {
      throw FormatException('E2EE envelope missing sender device id');
    }
    final localDeviceId = _deviceId;
    final remoteUserId = _extractPeerId(sessionId);

    // Get stored session state and unwrap the context-bound envelope.
    final storedBase64 = await sessionStore.getSession(
      sessionId: sessionId,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: senderDeviceId,
    );

    if (storedBase64 == null) {
      throw Exception('no E2EE session found for $sessionId');
    }
    final stateBase64 = await _restoreSessionState(
      sessionId: sessionId,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: senderDeviceId,
      envelopeBase64: storedBase64,
    );

    // Decrypt via FRB.
    final result = await adapter.decryptMessage(
      stateBase64: stateBase64,
      envelope: normalizedEnvelope,
    );

    // Save updated session state as a context-bound envelope.
    final newStateBase64 = result['new_state'] as String;
    final newEnvelopeBase64 = await _exportSessionState(
      sessionId: sessionId,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: senderDeviceId,
      stateBase64: newStateBase64,
    );
    await sessionStore.saveSession(
      sessionId: sessionId,
      stateBase64: newEnvelopeBase64,
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
      // Local state is authoritative for the UI.
    }
  }

  /// Reconcile local E2EE state with the server-side negotiation state.
  ///
  /// This recovers devices that missed websocket negotiation events while
  /// offline. It only exposes locally persisted Rust session state when the
  /// server confirms that the channel is encrypted.
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

  /// Load key material JSON from local storage.
  Future<Map<String, dynamic>> _getLocalKeyMaterial() async {
    final raw = await keyStore.getKeyMaterial();
    if (raw == null) {
      throw Exception('local E2EE key material not found');
    }
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  String? _firstString(Map<String, dynamic> source, Iterable<String> keys) {
    for (final key in keys) {
      final value = source[key];
      if (value == null) continue;
      final text = value is String ? value.trim() : value.toString().trim();
      if (text.isNotEmpty) return text;
    }
    return null;
  }

  Map<String, dynamic> _normalizeEnvelopeForRust(
      Map<String, dynamic> envelope) {
    final normalized = Map<String, dynamic>.from(envelope);

    void copyAlias(String target, Iterable<String> aliases) {
      if (normalized[target] != null) return;
      for (final alias in aliases) {
        final value = envelope[alias];
        if (value != null) {
          normalized[target] = value;
          return;
        }
      }
    }

    copyAlias('algorithm', const ['alg']);
    copyAlias('sender_device_id', const ['senderDeviceId']);
    copyAlias('recipient_device_id', const ['recipientDeviceId']);
    copyAlias('recipient_device_ids', const ['recipientDeviceIds']);
    copyAlias('recipient_user_id', const ['recipientUserId']);
    copyAlias('session_id', const ['sessionId']);
    copyAlias('key_version', const ['keyVersion']);
    return normalized;
  }

  /// Build the PreKeyBundleFetch JSON expected by the FRB bridge.
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

  /// Builds the canonical E2EE private session ID from two user IDs.
  ///
  /// Format: `p_<smaller_id>_<larger_id>` using string ordering.
  /// Mirrors the format expected by the Rust server.
  static String privateSessionId(String currentUserId, String targetId) {
    if (currentUserId.isEmpty || targetId.isEmpty) return targetId;
    final first =
        currentUserId.compareTo(targetId) <= 0 ? currentUserId : targetId;
    final second =
        currentUserId.compareTo(targetId) <= 0 ? targetId : currentUserId;
    return 'p_${first}_$second';
  }

  /// Wrap a raw ratchet state in a context-bound envelope.
  Future<String> _exportSessionState({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    required String stateBase64,
  }) async {
    return adapter.exportSessionEnvelope(
      stateBase64: stateBase64,
      userId: currentUserId?.trim() ?? '',
      deviceId: localDeviceId,
      sessionId: sessionId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );
  }

  /// Unwrap a context-bound session envelope back to a raw ratchet state.
  ///
  /// Falls back to the raw blob for legacy state that predates context binding,
  /// logging a warning so operators can identify stale clients.
  Future<String> _restoreSessionState({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    required String envelopeBase64,
  }) async {
    try {
      return await adapter.restoreSessionEnvelope(
        envelopeBase64: envelopeBase64,
        userId: currentUserId?.trim() ?? '',
        deviceId: localDeviceId,
        sessionId: sessionId,
        remoteUserId: remoteUserId,
        remoteDeviceId: remoteDeviceId,
      );
    } catch (e) {
      AppLogger.instance.warn(
        'Legacy E2EE session state encountered for $sessionId; '
        'importing without context binding.',
        e,
      );
      return envelopeBase64;
    }
  }

  /// Extract the peer user ID from a private session ID.
  ///
  /// Only the canonical `p_{id_a}_{id_b}` format is supported; the legacy
  /// `{userId}_private_{targetId}` format has been removed.
  String _extractPeerId(String sessionId) {
    if (!sessionId.startsWith('p_')) {
      throw FormatException(
        'E2EE private session id must use p_{id_a}_{id_b} format',
        sessionId,
      );
    }
    final parts = sessionId.substring(2).split('_');
    if (parts.length != 2) {
      throw FormatException('invalid E2EE private session id', sessionId);
    }
    if (currentUserId == null) {
      throw StateError('currentUserId is null, cannot determine peer');
    }
    return parts[0] == currentUserId ? parts[1] : parts[0];
  }

  /// Generate a 6-digit verify phrase.
  String _generateVerifyPhrase() {
    final rng = Random.secure();
    return (rng.nextInt(1000000)).toString().padLeft(6, '0');
  }
}
