import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/e2ee.dart';
import '../helpers/fakes.dart';

class _FakeWsClient implements WsClientPort {
  final _events = StreamController<WsEvent>.broadcast();
  final _state = StreamController<WsConnectionState>.broadcast();

  @override
  Stream<WsEvent> get events => _events.stream;

  @override
  Stream<WsConnectionState> get connectionState => _state.stream;

  @override
  bool get isConnected => true;

  @override
  String get wsBaseUrl => 'ws://localhost';

  @override
  Future<void> connect(String url) async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}

  void dispose() {
    _events.close();
    _state.close();
  }
}

class _FakeSecureStoragePort implements SecureStoragePort {
  final _values = <String, String>{};

  @override
  Future<bool> containsKey(String key) async => _values.containsKey(key);

  @override
  Future<void> delete(String key) async => _values.remove(key);

  @override
  Future<void> deleteAll() async => _values.clear();

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async => _values[key] = value;
}

class _FakeWsEvent implements WsEvent {
  _FakeWsEvent(this.type, this.data);

  @override
  final String type;
  @override
  final Map<String, dynamic> data;
  @override
  final int timestamp = 0;
}

class _ThrowingE2eeBridge implements E2eeBridge {
  @override
  Future<Uint8List> generateKeyBundle(int otkCount) async => throw UnimplementedError();
  @override
  Future<Uint8List> x3dhInitiate(Uint8List identityKey, Uint8List signedPreKey, Uint8List? oneTimePreKey) async => throw UnimplementedError();
  @override
  Future<Uint8List> x3dhRespond(Uint8List identityKey, Uint8List ephemeralKey, Uint8List signedPreKey, Uint8List? oneTimePreKey) async => throw UnimplementedError();
  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(Uint8List state, Uint8List plaintext) async => throw UnimplementedError();
  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(Uint8List state, Uint8List ciphertext) async => throw UnimplementedError();
  @override
  Future<Uint8List> exportState(Uint8List state) async => throw UnimplementedError();
  @override
  Future<Uint8List> restoreState(Uint8List state) async => throw UnimplementedError();
  @override
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) async => throw UnimplementedError();
  @override
  Future<Map<String, dynamic>> createOutboundSession({required String sessionId, required String localIdentityKeyPairBase64, required String remoteBundleBase64}) async => throw UnimplementedError();
  @override
  Future<Map<String, dynamic>> createInboundSession({required String sessionId, required String localIdentityKeyPairBase64, required String localSpkPairBase64, String? localOtkPairBase64, required String remoteIdentityKeyBase64, required String remoteHandshakeBase64}) async => throw UnimplementedError();
  @override
  Future<Map<String, dynamic>> encryptMessage({required String stateBase64, required String plaintextBase64, required String senderDeviceId, required String recipientDeviceId, required String sessionId, String? handshakeBase64}) async => throw UnimplementedError();
  @override
  Future<Map<String, dynamic>> decryptMessage({required String stateBase64, required Map<String, dynamic> envelope}) async => throw UnimplementedError();
  @override
  Future<String> exportSessionEnvelope({required String stateBase64, required String userId, required String deviceId, required String sessionId, required String remoteUserId, required String remoteDeviceId}) async => throw UnimplementedError();
  @override
  Future<String> restoreSessionEnvelope({required String envelopeBase64, required String userId, required String deviceId, required String sessionId, required String remoteUserId, required String remoteDeviceId}) async => throw UnimplementedError();
}

class _FakeE2eeKeyStore implements E2eeKeyStore {
  @override
  Future<void> init() async {}
  @override
  Future<String?> getKeyMaterial() async => null;
  @override
  Future<void> saveKeyMaterial(String base64Bundle) async {}
  @override
  Future<void> markOneTimePreKeyConsumed(int oneTimePreKeyId) async {}
  @override
  Future<String?> getDeviceId() async => 'device-u1';
  @override
  Future<void> saveDeviceId(String deviceId) async {}
  @override
  Future<String?> getPublicBundle() async => null;
  @override
  Future<void> savePublicBundle(String bundleJson) async {}
  @override
  Future<void> clearKeyMaterial() async {}
  @override
  Future<void> clearAll() async {}
  @override
  void dispose() {}
}

class _FakeE2eeSessionStore implements E2eeSessionStore {
  @override
  Future<void> init() async {}
  @override
  Future<void> saveSession({required String sessionId, required String stateBase64, required String localDeviceId, required String remoteUserId, required String remoteDeviceId, String direction = 'outbound'}) async {}
  @override
  Future<String?> getSession({required String sessionId, required String localDeviceId, required String remoteUserId, required String remoteDeviceId}) async => null;
  @override
  Future<SessionLookupResult?> findSessionByLocalDevice({required String sessionId, required String localDeviceId}) async => null;
  @override
  Future<void> deleteSession(String sessionId) async {}
  @override
  Future<void> clearAll() async {}
  @override
  void dispose() {}
}

E2eeManager _createFakeE2eeManager(E2eeMetaStore metaStore) {
  return E2eeManager(
    adapter: _ThrowingE2eeBridge(),
    api: E2eeApi(FakeHttpClientPort()),
    keyStore: _FakeE2eeKeyStore(),
    sessionStore: _FakeE2eeSessionStore(),
    metaStore: metaStore,
    currentUserId: 'u1',
  );
}

Message _sampleMessage(String id, {String status = 'SENT'}) => Message(
      id: id,
      senderId: 'u1',
      receiverId: 'u2',
      isGroupChat: false,
      messageType: 'TEXT',
      content: 'hello',
      sendTime: '2026-01-01T00:00:00Z',
      status: status,
    );

Map<String, dynamic> _sampleMessageJson(String id, {String status = 'SENT'}) =>
    {
      'id': id,
      'senderId': 'u1',
      'receiverId': 'u2',
      'isGroupChat': false,
      'messageType': 'TEXT',
      'content': 'hello',
      'sendTime': '2026-01-01T00:00:00Z',
      'status': status,
    };

void main() {
  group('ChatNotifier recallMessage / deleteMessage', () {
    late FakeHttpClientPort http;
    late MessageApi messageApi;
    late _FakeWsClient ws;
    late ChatNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      messageApi = MessageApi(http);
      ws = _FakeWsClient();
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        ws,
        () => 'u1',
      );
    });

    tearDown(() {
      notifier.dispose();
      ws.dispose();
    });

    test('recallMessage calls API and updates local message state', () async {
      // Pre-populate state with a message via direct state mutation to avoid
      // addMessage normalization issues.
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-1', status: 'SENT')],
        },
      );
      expect(notifier.state.messages[sessionKey], hasLength(1));

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.recall('msg-1'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessageJson('msg-1', status: 'RECALLED')),
        );
      };

      final result = await notifier.recallMessage('msg-1');
      expect(result, isNotNull);
      expect(result!.status, 'RECALLED');

      // Local state should be updated.
      final localMsg = notifier.state.messages[sessionKey]!.first;
      expect(localMsg.status, 'RECALLED');
    });

    test('deleteMessage calls API and updates local message state', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-2', status: 'SENT')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, MessageEndpoints.delete('msg-2'));
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson(_sampleMessageJson('msg-2', status: 'DELETED')),
        );
      };

      final result = await notifier.deleteMessage('msg-2');
      expect(result, isNotNull);
      expect(result!.status, 'DELETED');

      final localMsg = notifier.state.messages[sessionKey]!.first;
      expect(localMsg.status, 'DELETED');
    });

    test('recallMessage sets error on API failure', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-3')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Not found');
      };

      final result = await notifier.recallMessage('msg-3');
      expect(result, isNull);
      expect(notifier.state.error, isNotNull);
    });

    test('deleteMessage sets error on API failure', () async {
      final sessionKey = 'u1_session1';
      notifier.state = notifier.state.copyWith(
        messages: {
          sessionKey: [_sampleMessage('msg-4')],
        },
      );

      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        throw Exception('Server error');
      };

      final result = await notifier.deleteMessage('msg-4');
      expect(result, isNull);
      expect(notifier.state.error, isNotNull);
    });

    test('addMessage does not duplicate messages with clientMessageId', () {
      notifier.addMessage(
        'u1_u2',
        const Message(
          id: 'server-1',
          senderId: 'u1',
          receiverId: 'u2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'hello once',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENT',
          clientMessageId: 'local-1',
        ),
      );

      final messages = notifier.state.messages['u1_u2'];
      expect(messages, isNotNull);
      expect(messages, hasLength(1));
      expect(messages!.single.id, 'server-1');
      expect(messages.single.clientMessageId, 'local-1');
    });

    test('server ack replaces pending message via clientMessageId', () {
      notifier.addMessage(
        'u1_u2',
        const Message(
          id: 'local-2',
          senderId: 'u1',
          receiverId: 'u2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'pending then sent',
          sendTime: '2026-01-01T00:00:00Z',
          status: 'SENDING',
          clientMessageId: 'local-2',
        ),
      );
      notifier.addMessage(
        'u1_u2',
        const Message(
          id: 'server-2',
          senderId: 'u1',
          receiverId: 'u2',
          isGroupChat: false,
          messageType: 'TEXT',
          content: 'pending then sent',
          sendTime: '2026-01-01T00:00:01Z',
          status: 'SENT',
          clientMessageId: 'local-2',
        ),
      );

      final messages = notifier.state.messages['u1_u2'];
      expect(messages, isNotNull);
      expect(messages, hasLength(1));
      expect(messages!.single.id, 'server-2');
      expect(messages.single.status, 'SENT');
    });
  });

  group('ChatNotifier E2EE status callback', () {
    late _FakeWsClient ws;
    late E2eeMetaStore metaStore;
    late ChatNotifier notifier;
    late List<String> capturedSessionIds;
    final sessionId = 'p_u1_u2';

    setUp(() {
      ws = _FakeWsClient();
      metaStore = E2eeMetaStore(_FakeSecureStoragePort());
      final manager = _createFakeE2eeManager(metaStore);
      capturedSessionIds = <String>[];
      notifier = ChatNotifier(
        MessageApi(FakeHttpClientPort()),
        MessagePipeline(),
        ws,
        () => 'u1',
        e2eeManager: manager,
        e2eeMetaStore: metaStore,
        onE2eeStatusChanged: capturedSessionIds.add,
      );
    });

    tearDown(() {
      notifier.dispose();
      ws.dispose();
    });

    Future<void> _emitNegotiation(String action) async {
      ws._events.add(_FakeWsEvent(
        WsMessageType.e2eeNegotiation,
        {
          'action': action,
          'sessionId': sessionId,
          'requesterId': 'u2',
          'targetUserId': 'u1',
        },
      ));
      // Allow the async event handler to complete.
      await Future<void>.delayed(Duration.zero);
    }

    test('accepted event updates status and notifies callback', () async {
      await metaStore.setSessionStatus(sessionId, 'negotiating');
      await _emitNegotiation('accepted');

      final status = await metaStore.getSessionStatus(sessionId);
      expect(status, 'encrypted');
      expect(capturedSessionIds, contains(sessionId));
    });

    test('disabled event updates status and notifies callback', () async {
      await metaStore.setSessionStatus(sessionId, 'encrypted');
      await _emitNegotiation('disabled');

      final status = await metaStore.getSessionStatus(sessionId);
      expect(status, 'plaintext');
      expect(capturedSessionIds, contains(sessionId));
    });
  });

  group('ChatNotifier markRead', () {
    late FakeHttpClientPort http;
    late MessageApi messageApi;
    late _FakeWsClient ws;
    late ChatNotifier notifier;

    setUp(() {
      http = FakeHttpClientPort();
      messageApi = MessageApi(http);
      ws = _FakeWsClient();
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        ws,
        () => 'u1',
      );
    });

    tearDown(() {
      notifier.dispose();
      ws.dispose();
    });

    test('markRead uses conversationId from session', () async {
      const sessionKey = 'u1_u2';
      const conversationId = 'conv-123';
      notifier.state = notifier.state.copyWith(
        sessions: [
          const ChatSession(
            id: sessionKey,
            type: 'private',
            targetId: 'u2',
            targetName: 'User Two',
            unreadCount: 3,
            conversationId: conversationId,
          ),
        ],
      );

      String? capturedPath;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        capturedPath = path;
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      await notifier.markRead(sessionKey);

      expect(capturedPath, MessageEndpoints.markRead(conversationId));
    });

    test('markRead skips when conversationId is missing', () async {
      const sessionKey = 'u1_u2';
      notifier.state = notifier.state.copyWith(
        sessions: const [
          ChatSession(
            id: sessionKey,
            type: 'private',
            targetId: 'u2',
            targetName: 'User Two',
            unreadCount: 3,
          ),
        ],
      );

      var called = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        called = true;
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      await notifier.markRead(sessionKey);

      expect(called, isFalse);
    });
  });
}
