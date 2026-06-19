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
    test('re-registers when locally cached device is rejected by server',
        () async {
      final keyStore = _MemoryKeyStore(
        jsonEncode({
          'identity_key_pair_bincode': 'stale-identity-bincode',
          'signed_pre_key_pair_bincode': 'stale-spk-bincode',
          'otk_pairs': const [],
          'public_bundle': {
            'identity_key': 'stale-identity-public',
            'signed_pre_key': {'key': 'stale-public-spk'},
          },
        }),
      );
      final sessionStore = _MemorySessionStore()
        ..seedSession(
          sessionId: 'p_user-a_user-b',
          stateBase64: 'old-state',
          localDeviceId: 'stale-device',
          remoteUserId: 'user-b',
          remoteDeviceId: 'device-b',
        );
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({'e2ee_device_id': 'stale-device'}),
      );
      final api = _FakeE2eeApi()
        ..rejectHeartbeatForDeviceIds.add('stale-device');
      final bridge = _FakeE2eeBridge();
      final manager = E2eeManager(
        adapter: bridge,
        api: api,
        keyStore: keyStore,
        sessionStore: sessionStore,
        metaStore: metaStore,
        currentUserId: 'user-a',
      );

      final deviceId = await manager.ensureDeviceRegistered();

      expect(deviceId, isNot('stale-device'));
      expect(api.heartbeatDeviceIds, ['stale-device']);
      expect(api.uploadedBundles, hasLength(1));
      expect(api.uploadedBundles.single['deviceId'], deviceId);
      expect(keyStore.clearAllCount, 1);
      expect(sessionStore.clearAllCount, 1);
      expect(sessionStore.sessions, isEmpty);
      expect(bridge.generatedKeyBundleCount, 1);
    });

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
      expect(
        bridge.lastRestoreEnvelopeContext?['envelopeBase64'],
        'inbound-state',
      );
      expect(
        bridge.lastRestoreEnvelopeContext?['remoteUserId'],
        'user-a',
      );
      expect(
        bridge.lastExportEnvelopeContext?['stateBase64'],
        'decrypted-state',
      );
      expect(
        bridge.lastExportEnvelopeContext?['remoteUserId'],
        'user-a',
      );
      expect(sessionStore.savedSession?.stateBase64, 'envelope:decrypted-state');
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

  group('E2eeManager OTK replenishment', () {
    test('renumbers fresh OTK IDs to avoid collisions when server is low',
        () async {
      const existingCount = 5;
      final existingOtkPairs = List<Map<String, dynamic>>.generate(
        existingCount,
        (i) => {'id': i + 1, 'key_pair_bincode': 'otk-${i + 1}'},
      );
      final existingPublicOpks = List<Map<String, dynamic>>.generate(
        existingCount,
        (i) => {'id': i + 1, 'key': 'pub-otk-${i + 1}'},
      );
      final keyStore = _MemoryKeyStore(
        jsonEncode({
          'identity_key_pair_bincode': 'identity-bincode',
          'signed_pre_key_pair_bincode': 'spk-bincode',
          'otk_pairs': existingOtkPairs,
          'public_bundle': {
            'identity_key': 'identity-public',
            'signing_key': 'signing-public',
            'signed_pre_key': {'key': 'public-spk'},
            'signed_pre_key_signature': 'signature',
            'one_time_pre_keys': existingPublicOpks,
          },
        }),
      );
      const deviceId = 'device-x';
      final metaStore = E2eeMetaStore(
        FakeSecureStoragePort({
          'e2ee_device_id': deviceId,
          'e2ee:otk_published:$deviceId': '1,2,3,4,5',
          'e2ee:otk_max_published:$deviceId': '$existingCount',
        }),
      );
      final api = _FakeE2eeApi()
        ..opkStatuses[deviceId] = {'lowWatermark': true, 'count': 10};
      final bridge = _FakeE2eeBridge();
      final manager = E2eeManager(
        adapter: bridge,
        api: api,
        keyStore: keyStore,
        sessionStore: _MemorySessionStore(),
        metaStore: metaStore,
        currentUserId: 'user-a',
      );

      await manager.ensureDeviceRegistered();

      expect(bridge.generatedKeyBundleCount, 1);
      expect(api.refillOpkPayloads, hasLength(1));
      final refillPayload = api.refillOpkPayloads.single;
      expect(refillPayload['deviceId'], deviceId);

      final uploadedOpks = (refillPayload['oneTimePreKeys'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      expect(uploadedOpks, hasLength(100));
      expect(uploadedOpks.first['id'], existingCount + 1);
      expect(uploadedOpks.last['id'], existingCount + uploadedOpks.length);

      final keyMaterial =
          jsonDecode(keyStore.keyMaterial!) as Map<String, dynamic>;
      final storedOtkPairs = (keyMaterial['otk_pairs'] as List<dynamic>)
          .cast<Map<String, dynamic>>();
      final storedIds = storedOtkPairs.map((o) => o['id'] as int).toList();
      expect(storedIds.toSet(), hasLength(storedIds.length));
      expect(
          storedIds,
          containsAll(List.generate(
              existingCount + uploadedOpks.length, (i) => i + 1)));

      final storedPublicBundle =
          keyMaterial['public_bundle'] as Map<String, dynamic>;
      final storedPublicOpks =
          (storedPublicBundle['one_time_pre_keys'] as List<dynamic>)
              .cast<Map<String, dynamic>>();
      expect(storedPublicOpks.map((o) => o['id'] as int).toSet(),
          storedIds.toSet());

      expect(await metaStore.getMaxPublishedOtkId(deviceId),
          existingCount + uploadedOpks.length);
      expect(await metaStore.getPublishedOtkIds(deviceId),
          hasLength(existingCount + uploadedOpks.length));
    });
  });

  group('E2eeManager private session ID', () {
    test('privateSessionId builds canonical p_ format', () {
      expect(
          E2eeManager.privateSessionId('user-a', 'user-b'), 'p_user-a_user-b');
      expect(
          E2eeManager.privateSessionId('user-b', 'user-a'), 'p_user-a_user-b');
      expect(E2eeManager.privateSessionId('', 'user-b'), 'user-b');
      expect(E2eeManager.privateSessionId('user-a', ''), '');
    });

    test('rejects legacy {user}_private_{target} session id', () async {
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
        'user-a_private_user-b',
        {
          'senderDeviceId': 'device-a',
          'targetDeviceId': 'device-b',
          'senderIdentityKey': 'sender-identity',
          'handshake': _handshakeWithOtkId(7),
        },
      );

      expect(accepted, isFalse);
      expect(
          await metaStore.getSessionStatus('user-a_private_user-b'), 'failed');
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
  Map<String, String>? lastExportEnvelopeContext;
  Map<String, String>? lastRestoreEnvelopeContext;
  int generatedKeyBundleCount = 0;

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
  }) async {
    lastExportEnvelopeContext = {
      'stateBase64': stateBase64,
      'userId': userId,
      'deviceId': deviceId,
      'sessionId': sessionId,
      'remoteUserId': remoteUserId,
      'remoteDeviceId': remoteDeviceId,
    };
    return 'envelope:$stateBase64';
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
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) async {
    generatedKeyBundleCount++;
    return {
      'identity_key_pair_bincode': 'fresh-identity-bincode',
      'signed_pre_key_pair_bincode': 'fresh-spk-bincode',
      'otk_pairs': List.generate(
        otkCount,
        (index) => {
          'id': index + 1,
          'key_pair_bincode': 'fresh-otk-pair-${index + 1}',
        },
      ),
      'public_bundle': {
        'identity_key': 'fresh-identity-public',
        'signing_key': 'fresh-signing-public',
        'signed_pre_key': {'key': 'fresh-public-spk'},
        'signed_pre_key_signature': 'fresh-spk-signature',
        'one_time_pre_keys': List.generate(
          otkCount,
          (index) => {
            'id': index + 1,
            'key': 'fresh-public-otk-${index + 1}',
          },
        ),
      },
    };
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
  }) async {
    lastRestoreEnvelopeContext = {
      'envelopeBase64': envelopeBase64,
      'userId': userId,
      'deviceId': deviceId,
      'sessionId': sessionId,
      'remoteUserId': remoteUserId,
      'remoteDeviceId': remoteDeviceId,
    };
    if (envelopeBase64.startsWith('envelope:')) {
      return envelopeBase64.substring(9);
    }
    return envelopeBase64;
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
  final rejectHeartbeatForDeviceIds = <String>{};
  final sessionStatuses = <String, String>{};
  final devicesByUser = <String, List<Map<String, dynamic>>>{};
  final bundlesByUserAndDevice = <String, Map<String, dynamic>>{};
  final requestPayloads = <String>[];
  final uploadedBundles = <Map<String, dynamic>>[];
  final opkStatuses = <String, Map<String, dynamic>>{};
  final refillOpkPayloads = <Map<String, dynamic>>[];

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
    if (rejectHeartbeatForDeviceIds.contains(deviceId)) {
      throw Exception('status code of 403: device does not belong to user');
    }
  }

  @override
  Future<void> uploadBundle(Map<String, dynamic> bundleData) async {
    uploadedBundles.add(Map<String, dynamic>.from(bundleData));
  }

  @override
  Future<Map<String, dynamic>> getOpkStatus(String deviceId) async {
    return opkStatuses[deviceId] ?? {'lowWatermark': false, 'count': 100};
  }

  @override
  Future<void> refillOpk(Map<String, dynamic> opkData) async {
    refillOpkPayloads.add(Map<String, dynamic>.from(opkData));
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
  String? deviceId;
  String? publicBundle;
  int clearAllCount = 0;
  final consumedOtkIds = <int>[];

  @override
  Future<void> init() async {}

  @override
  Future<String?> getKeyMaterial() async => keyMaterial;

  @override
  Future<void> saveKeyMaterial(String base64Bundle) async {
    keyMaterial = base64Bundle;
  }

  @override
  Future<void> saveDeviceId(String deviceId) async {
    this.deviceId = deviceId;
  }

  @override
  Future<String?> getDeviceId() async => deviceId;

  @override
  Future<void> savePublicBundle(String bundleJson) async {
    publicBundle = bundleJson;
  }

  @override
  Future<String?> getPublicBundle() async => publicBundle;

  @override
  Future<void> clearKeyMaterial() async {
    keyMaterial = null;
    publicBundle = null;
  }

  @override
  Future<void> clearAll() async {
    clearAllCount++;
    keyMaterial = null;
    deviceId = null;
    publicBundle = null;
    consumedOtkIds.clear();
  }

  @override
  void dispose() {}

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
  int clearAllCount = 0;

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

  @override
  Future<void> clearAll() async {
    clearAllCount++;
    savedSession = null;
    sessions.clear();
  }

  @override
  void dispose() {}
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
