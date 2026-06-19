import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/e2ee/data/e2ee_api.dart';
import 'package:im_web/features/e2ee/data/e2ee_key_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_manager.dart';
import 'package:im_web/features/e2ee/data/e2ee_meta_store.dart';
import 'package:im_web/features/e2ee/data/e2ee_session_store.dart';

import '../../helpers/fakes.dart';

void main() {
  group('E2eeManager responder flow', () {
    test('consumes the local OTK after accepting an inbound negotiation',
        () async {
      final keyStore = _MemoryKeyStore(
        jsonEncode({
          'identity_key_pair_bincode': 'identity-bincode',
          'signed_pre_key_pair_bincode': 'spk-bincode',
          'otk_pairs': [
            {'id': 7, 'key_pair_bincode': 'otk-seven'},
          ],
          'public_bundle': {
            'signed_pre_key': {'key': 'public-spk'},
          },
        }),
      );
      final sessionStore = _MemorySessionStore();
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({'e2ee_device_id': 'device-b'}),
      );
      final api = _FakeE2eeApi();
      final bridge = _FakeE2eeBridge();
      final manager = E2eeManager(
        adapter: bridge,
        api: api,
        keyStore: keyStore,
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-b',
      );

      final accepted = await manager.respondToNegotiation(
        'p_user-a_user-b',
        {
          'senderDeviceId': 'device-a',
          'targetDeviceId': 'device-b',
          'senderIdentityKey': 'sender-identity',
          'senderUserId': 'user-a',
          'handshake': _handshakeWithOtkId(7),
        },
      );

      expect(accepted, isTrue);
      expect(bridge.lastLocalOtkPairBase64, 'otk-seven');
      expect(keyStore.consumedOtkIds, [7]);
      expect(sessionStore.savedSession?.sessionId, 'p_user-a_user-b');
      expect(sessionStore.savedSession?.remoteUserId, 'user-a');
      expect(sessionStore.savedSession?.remoteDeviceId, 'device-a');
      expect(await metaStore.getSessionStatus('p_user-a_user-b'), 'encrypted');
      expect(api.acceptedSessionIds, ['p_user-a_user-b']);
      expect(api.heartbeatDeviceIds, ['device-b']);
    });

    test('derives sender user from private session id for legacy payloads',
        () async {
      final keyStore = _MemoryKeyStore(
        jsonEncode({
          'identity_key_pair_bincode': 'identity-bincode',
          'signed_pre_key_pair_bincode': 'spk-bincode',
          'otk_pairs': [
            {'id': 7, 'key_pair_bincode': 'otk-seven'},
          ],
          'public_bundle': {
            'signed_pre_key': {'key': 'public-spk'},
          },
        }),
      );
      final sessionStore = _MemorySessionStore();
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({'e2ee_device_id': 'device-b'}),
      );
      final manager = E2eeManager(
        adapter: _FakeE2eeBridge(),
        api: _FakeE2eeApi(),
        keyStore: keyStore,
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-b',
      );

      final accepted = await manager.respondToNegotiation(
        'p_user-a_user-b',
        {
          'senderDeviceId': 'device-a',
          'targetDeviceId': 'device-b',
          'senderIdentityKey': 'sender-identity',
          'handshake': _handshakeWithOtkId(7),
        },
      );

      expect(accepted, isTrue);
      expect(sessionStore.savedSession?.remoteUserId, 'user-a');
      expect(sessionStore.savedSession?.remoteDeviceId, 'device-a');
    });
  });

  group('E2eeManager initiator flow', () {
    test('includes senderUserId in pending and server request payloads',
        () async {
      final keyStore = _MemoryKeyStore(
        jsonEncode({
          'identity_key_pair_bincode': 'identity-bincode',
          'signed_pre_key_pair_bincode': 'spk-bincode',
          'otk_pairs': const [],
          'public_bundle': {
            'identity_key': 'identity-public',
            'signed_pre_key': {'key': 'public-spk'},
          },
        }),
      );
      final sessionStore = _MemorySessionStore();
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({'e2ee_device_id': 'device-a'}),
      );
      final api = _FakeE2eeApi()
        ..devicesByUser['user-b'] = [
          {
            'deviceId': 'device-b',
            'lastActiveAt': '2026-06-19T00:00:00Z',
          },
        ]
        ..bundlesByUserAndDevice['user-b:device-b'] = {
          'deviceId': 'device-b',
          'identityKey': 'remote-identity',
          'signingIdentityKey': 'remote-signing',
          'signedPreKey': 'remote-spk',
          'signedPreKeySignature': 'remote-spk-signature',
          'oneTimePreKey': 'remote-otk',
          'oneTimePreKeyId': 9,
        };
      final manager = E2eeManager(
        adapter: _FakeE2eeBridge(),
        api: api,
        keyStore: keyStore,
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-a',
      );

      final started =
          await manager.initiateNegotiation('p_user-a_user-b', 'user-b');

      expect(started, isTrue);
      final pending = jsonDecode(
        (await metaStore.getPendingHandshake('p_user-a_user-b'))!,
      ) as Map<String, dynamic>;
      expect(pending['senderUserId'], 'user-a');
      expect(pending['senderDeviceId'], 'device-a');
      expect(pending['targetDeviceId'], 'device-b');

      expect(api.requestPayloads, hasLength(1));
      final requestPayload =
          jsonDecode(api.requestPayloads.single) as Map<String, dynamic>;
      expect(requestPayload['senderUserId'], 'user-a');
      expect(requestPayload['senderDeviceId'], 'device-a');
      expect(requestPayload['targetDeviceId'], 'device-b');
      expect(sessionStore.savedSession?.remoteUserId, 'user-b');
      expect(sessionStore.savedSession?.remoteDeviceId, 'device-b');
    });
  });

  group('E2eeManager envelope handling', () {
    test('decrypts camelCase envelopes from the API layer', () async {
      final sessionStore = _MemorySessionStore()
        ..seedSession(
          sessionId: 'p_user-a_user-b',
          stateBase64: 'inbound-state',
          localDeviceId: 'device-b',
          remoteUserId: 'user-a',
          remoteDeviceId: 'device-a',
        );
      final bridge = _FakeE2eeBridge();
      final manager = E2eeManager(
        adapter: bridge,
        api: _FakeE2eeApi(),
        keyStore: _MemoryKeyStore(null),
        sessionStore: sessionStore,
        metaStore: E2eeMetaStore(
          FakeSecureStoragePort({'e2ee_device_id': 'device-b'}),
        ),
        currentUserId: 'user-b',
      );

      final plaintext = await manager.decryptEnvelope(
        sessionId: 'p_user-a_user-b',
        envelope: {
          'algorithm': 'x3dh-ratchet-v1',
          'senderDeviceId': 'device-a',
          'recipientDeviceId': 'device-b',
          'sessionId': 'p_user-a_user-b',
          'wire': 'wire-base64',
        },
      );

      expect(plaintext, 'hello');
      expect(bridge.lastDecryptEnvelope?['sender_device_id'], 'device-a');
      expect(bridge.lastDecryptEnvelope?['recipient_device_id'], 'device-b');
      expect(bridge.lastDecryptEnvelope?['session_id'], 'p_user-a_user-b');
      expect(sessionStore.savedSession?.stateBase64, 'decrypted-state');
    });
  });

  group('E2eeManager status reconciliation', () {
    test('promotes missed accepted state when local Rust session exists',
        () async {
      final sessionStore = _MemorySessionStore()
        ..seedSession(
          sessionId: 'p_user-a_user-b',
          stateBase64: 'outbound-state',
          localDeviceId: 'device-a',
          remoteUserId: 'user-b',
          remoteDeviceId: 'device-b',
        );
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({
          'e2ee_device_id': 'device-a',
          'e2ee:remote_device:p_user-a_user-b': 'device-b',
        }),
      );
      final api = _FakeE2eeApi()
        ..sessionStatuses['p_user-a_user-b'] = 'encrypted';
      final manager = E2eeManager(
        adapter: _FakeE2eeBridge(),
        api: api,
        keyStore: _MemoryKeyStore(null),
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-a',
      );

      final status = await manager.syncSessionStatus('p_user-a_user-b');

      expect(status, 'encrypted');
      expect(await metaStore.getSessionStatus('p_user-a_user-b'), 'encrypted');
    });

    test('purges stale local session after missed disabled state', () async {
      final sessionStore = _MemorySessionStore()
        ..seedSession(
          sessionId: 'p_user-a_user-b',
          stateBase64: 'old-state',
          localDeviceId: 'device-a',
          remoteUserId: 'user-b',
          remoteDeviceId: 'device-b',
        );
      final storage = FakeSecureStoragePort({
        'e2ee_device_id': 'device-a',
        'e2ee:status:p_user-a_user-b': 'encrypted',
        'e2ee:remote_device:p_user-a_user-b': 'device-b',
      });
      final metaStore = E2eeMetaStore(storage);
      final api = _FakeE2eeApi()
        ..sessionStatuses['p_user-a_user-b'] = 'plaintext';
      final manager = E2eeManager(
        adapter: _FakeE2eeBridge(),
        api: api,
        keyStore: _MemoryKeyStore(null),
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-a',
      );

      final status = await manager.syncSessionStatus('p_user-a_user-b');

      expect(status, 'plaintext');
      expect(sessionStore.deletedSessionIds, ['p_user-a_user-b']);
      expect(await metaStore.getSessionStatus('p_user-a_user-b'), 'plaintext');
      expect(await metaStore.getRemoteDeviceId('p_user-a_user-b'), isNull);
    });
  });
}

String _handshakeWithOtkId(int otkId) {
  final bytes = List<int>.filled(40, 0);
  bytes[36] = (otkId >> 24) & 0xff;
  bytes[37] = (otkId >> 16) & 0xff;
  bytes[38] = (otkId >> 8) & 0xff;
  bytes[39] = otkId & 0xff;
  return base64Encode(bytes);
}

class _FakeE2eeBridge implements E2eeBridge {
  String? lastLocalOtkPairBase64;
  Map<String, dynamic>? lastDecryptEnvelope;

  @override
  Future<Map<String, dynamic>> createInboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String localSpkPairBase64,
    String? localOtkPairBase64,
    required String remoteIdentityKeyBase64,
    required String remoteHandshakeBase64,
  }) async {
    lastLocalOtkPairBase64 = localOtkPairBase64;
    return {'state': 'inbound-state', 'otk_id': 7};
  }

  @override
  Future<Map<String, dynamic>> createOutboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String remoteBundleBase64,
  }) async {
    return {'state': 'outbound-state', 'handshake': 'outbound-handshake'};
  }

  @override
  Future<Map<String, dynamic>> decryptMessage({
    required String stateBase64,
    required Map<String, dynamic> envelope,
  }) async {
    lastDecryptEnvelope = Map<String, dynamic>.from(envelope);
    return {
      'new_state': 'decrypted-state',
      'plaintext': base64Encode(utf8.encode('hello')),
    };
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
    throw UnimplementedError();
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
    throw UnimplementedError();
  }

  @override
  Future<Uint8List> exportState(Uint8List state) {
    throw UnimplementedError();
  }

  @override
  Future<Uint8List> generateKeyBundle(int otkCount) {
    throw UnimplementedError();
  }

  @override
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) {
    throw UnimplementedError();
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
    Uint8List state,
    Uint8List ciphertext,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
    Uint8List state,
    Uint8List plaintext,
  ) {
    throw UnimplementedError();
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
    throw UnimplementedError();
  }

  @override
  Future<Uint8List> restoreState(Uint8List state) {
    throw UnimplementedError();
  }

  @override
  Future<Uint8List> x3dhInitiate(
    Uint8List identityKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) {
    throw UnimplementedError();
  }

  @override
  Future<Uint8List> x3dhRespond(
    Uint8List identityKey,
    Uint8List ephemeralKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) {
    throw UnimplementedError();
  }
}

class _FakeE2eeApi extends E2eeApi {
  _FakeE2eeApi() : super(FakeHttpClientPort());

  final acceptedSessionIds = <String>[];
  final disabledSessionIds = <String>[];
  final heartbeatDeviceIds = <String>[];
  final sessionStatuses = <String, String>{};
  final devicesByUser = <String, List<Map<String, dynamic>>>{};
  final bundlesByUserAndDevice = <String, Map<String, dynamic>>{};
  final requestPayloads = <String>[];

  @override
  Future<void> acceptEncryption({
    required String sessionId,
    required String signedPreKey,
  }) async {
    acceptedSessionIds.add(sessionId);
  }

  @override
  Future<void> heartbeatDevice(String deviceId) async {
    heartbeatDeviceIds.add(deviceId);
  }

  @override
  Future<Map<String, dynamic>> getOpkStatus(String deviceId) async {
    return {'lowWatermark': false, 'count': 100};
  }

  @override
  Future<List<Map<String, dynamic>>> getDevices(String userId) async {
    return List<Map<String, dynamic>>.from(
      devicesByUser[userId] ?? const [],
    );
  }

  @override
  Future<Map<String, dynamic>> getBundle(
    String userId, {
    required String deviceId,
    required String conversationId,
    required String requesterDeviceId,
  }) async {
    return Map<String, dynamic>.from(
      bundlesByUserAndDevice['$userId:$deviceId'] ??
          {
            'deviceId': deviceId,
            'identityKey': 'remote-identity',
            'signingIdentityKey': 'remote-signing',
            'signedPreKey': 'remote-spk',
            'signedPreKeySignature': 'remote-signature',
          },
    );
  }

  @override
  Future<void> requestEncryption({
    required String sessionId,
    required String identityKey,
    required String signedPreKey,
    required String requestPayloadJson,
  }) async {
    requestPayloads.add(requestPayloadJson);
  }

  @override
  Future<void> disableEncryption(String sessionId) async {
    disabledSessionIds.add(sessionId);
  }

  @override
  Future<Map<String, dynamic>> getSessionStatus(String sessionId) async {
    return {
      'sessionId': sessionId,
      'status': sessionStatuses[sessionId] ?? 'plaintext',
      'stateVersion': 1,
    };
  }
}

class _MemoryKeyStore extends E2eeKeyStore {
  _MemoryKeyStore(this.keyMaterial);

  String? keyMaterial;
  final consumedOtkIds = <int>[];

  @override
  Future<void> init() async {}

  @override
  Future<String?> getKeyMaterial() async => keyMaterial;

  @override
  Future<void> markOneTimePreKeyConsumed(int oneTimePreKeyId) async {
    consumedOtkIds.add(oneTimePreKeyId);
    final decoded = jsonDecode(keyMaterial!) as Map<String, dynamic>;
    final otkPairs = decoded['otk_pairs'] as List<dynamic>;
    decoded['otk_pairs'] = otkPairs
        .where((otk) => (otk as Map<String, dynamic>)['id'] != oneTimePreKeyId)
        .toList();
    keyMaterial = jsonEncode(decoded);
  }
}

class _MemorySessionStore extends E2eeSessionStore {
  _SavedSession? savedSession;
  final sessions = <String, _SavedSession>{};
  final deletedSessionIds = <String>[];

  @override
  Future<void> init() async {}

  @override
  Future<void> saveSession({
    required String sessionId,
    required String stateBase64,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    String direction = 'outbound',
  }) async {
    savedSession = _SavedSession(
      sessionId: sessionId,
      stateBase64: stateBase64,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );
    sessions[sessionId] = savedSession!;
  }

  void seedSession({
    required String sessionId,
    required String stateBase64,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) {
    sessions[sessionId] = _SavedSession(
      sessionId: sessionId,
      stateBase64: stateBase64,
      localDeviceId: localDeviceId,
      remoteUserId: remoteUserId,
      remoteDeviceId: remoteDeviceId,
    );
  }

  @override
  Future<String?> getSession({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async {
    final session = sessions[sessionId];
    if (session == null) return null;
    if (session.localDeviceId != localDeviceId) return null;
    if (session.remoteUserId != remoteUserId) return null;
    if (session.remoteDeviceId != remoteDeviceId) return null;
    return session.stateBase64;
  }

  @override
  Future<SessionLookupResult?> findSessionByLocalDevice({
    required String sessionId,
    required String localDeviceId,
  }) async {
    final session = sessions[sessionId];
    if (session == null || session.localDeviceId != localDeviceId) {
      return null;
    }
    return SessionLookupResult(
      stateBase64: session.stateBase64,
      remoteDeviceId: session.remoteDeviceId,
    );
  }

  @override
  Future<void> deleteSession(String sessionId) async {
    deletedSessionIds.add(sessionId);
    sessions.remove(sessionId);
  }
}

class _SavedSession {
  const _SavedSession({
    required this.sessionId,
    required this.stateBase64,
    required this.localDeviceId,
    required this.remoteUserId,
    required this.remoteDeviceId,
  });

  final String sessionId;
  final String stateBase64;
  final String localDeviceId;
  final String remoteUserId;
  final String remoteDeviceId;
}
