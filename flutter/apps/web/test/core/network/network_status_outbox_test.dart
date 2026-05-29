import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_memory.dart';
import 'package:im_web/core/network/network_status_provider.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_core/core.dart';

import '../../helpers/fakes.dart';

/// Fake NetworkStatusDataSource for testing.
class FakeNetworkStatusDataSource implements NetworkStatusDataSource {
  bool _isOnline = true;
  bool _serverReachable = true;

  final _onlineController = StreamController<void>.broadcast();
  final _offlineController = StreamController<void>.broadcast();

  @override
  bool get isNavigatorOnline => _isOnline;

  @override
  Stream<void> get onOnline => _onlineController.stream;

  @override
  Stream<void> get onOffline => _offlineController.stream;

  @override
  Future<bool> checkServerReachable(String url) async => _serverReachable;

  void goOnline() {
    _isOnline = true;
    _onlineController.add(null);
  }

  void goOffline() {
    _isOnline = false;
    _offlineController.add(null);
  }

  void setOnline() {
    _isOnline = true;
  }

  void emitOnline() {
    _onlineController.add(null);
  }

  void setServerReachable(bool value) => _serverReachable = value;

  void dispose() {
    _onlineController.close();
    _offlineController.close();
  }
}

/// Fake MessageApi that tracks send attempts.
class FakeMessageApi extends MessageApi {
  FakeMessageApi() : super(FakeHttpClientPort());

  int sendCount = 0;
  bool shouldFail = false;

  Message _makeMessage(String content, String messageType, String? clientMessageId) {
    return Message(
      id: 'msg_${sendCount}',
      senderId: 'sender1',
      isGroupChat: false,
      messageType: messageType,
      content: content,
      sendTime: DateTime.now().toIso8601String(),
      status: 'sent',
      clientMessageId: clientMessageId,
    );
  }

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage(request.content, request.messageType, request.clientMessageId);
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage(request.content, request.messageType, request.clientMessageId);
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    sendCount++;
    if (shouldFail) throw Exception('Network error');
    return _makeMessage('[encrypted]', messageType, clientMessageId);
  }
}

void main() {
  late FakeNetworkStatusDataSource dataSource;
  late NetworkStatusNotifier notifier;
  late FakeMessageApi messageApi;
  late IdbFactory idbFactory;

  setUp(() {
    dataSource = FakeNetworkStatusDataSource();
    notifier = NetworkStatusNotifier(dataSource: dataSource);
    messageApi = FakeMessageApi();
    idbFactory = newIdbFactoryMemory();
  });

  tearDown(() {
    notifier.dispose();
    dataSource.dispose();
  });

  group('Outbox network linkage', () {
    test('offline: messages enter outbox without sending', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_001',
      );

      expect(messageApi.sendCount, 0);
      final pending = await outbox.getPendingCount();
      expect(pending, 1);

      outbox.dispose();
    });

    test('offline -> online triggers onNetworkAvailable retry', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_002',
      );
      expect(messageApi.sendCount, 0);

      // Simulate network restoration
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);

      // Trigger the same logic as outbox_provider's ref.listen
      outbox.onNetworkAvailable();
      // Allow async processing
      await Future<void>.delayed(const Duration(milliseconds: 100));

      expect(messageApi.sendCount, 1);
      final pending = await outbox.getPendingCount();
      expect(pending, 0);

      outbox.dispose();
    });

    test('online -> limited does not clear outbox', () async {
      // Ensure server is reachable so goOnline() results in online state
      dataSource.setServerReachable(true);
      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      // Start online, enqueue a message (it will try to send)
      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_003',
      );

      // Now go limited (navigator online, server unreachable)
      dataSource.setServerReachable(false);
      await notifier.forceCheck();
      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.isOnline, isFalse);

      // Enqueue another message while limited
      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello2',
        clientMessageId: 'msg_004',
      );

      // Should NOT have triggered onNetworkAvailable
      // (limited means isOnline=false, so new messages queue up)
      final pending = await outbox.getPendingCount();
      expect(pending, greaterThanOrEqualTo(1));

      outbox.dispose();
    });

    test('limited -> online triggers retry once', () async {
      dataSource.setServerReachable(false);
      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_005',
      );
      final sendCountBefore = messageApi.sendCount;

      // Recover to online
      dataSource.setServerReachable(true);
      await notifier.forceCheck();
      expect(notifier.state.isOnline, isTrue);

      outbox.onNetworkAvailable();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // Should have retried exactly once
      expect(messageApi.sendCount, sendCountBefore + 1);

      outbox.dispose();
    });

    test('offline -> limited does not trigger retry', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_006',
      );
      final sendCountBefore = messageApi.sendCount;

      // Navigator goes online but server unreachable -> limited
      dataSource.setOnline();
      dataSource.setServerReachable(false);
      dataSource.emitOnline();
      await Future<void>.delayed(Duration.zero);
      await notifier.forceCheck();

      expect(notifier.state.isLimited, isTrue);
      expect(notifier.state.isOnline, isFalse);

      // Should NOT have retried
      expect(messageApi.sendCount, sendCountBefore);

      outbox.dispose();
    });

    test('rapid offline -> online only triggers one retry cycle', () async {
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);

      final outbox = MessageOutbox(
        messageApi: messageApi,
        idbFactory: idbFactory,
        isOnline: () => notifier.state.isOnline,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session1',
        receiverId: 'user1',
        content: 'hello',
        clientMessageId: 'msg_007',
      );

      // Rapid transitions: offline -> online -> offline -> online
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);
      dataSource.goOffline();
      await Future<void>.delayed(Duration.zero);
      dataSource.goOnline();
      await Future<void>.delayed(Duration.zero);

      // Call onNetworkAvailable once (as outbox_provider would)
      outbox.onNetworkAvailable();
      await Future<void>.delayed(const Duration(milliseconds: 100));

      // Should have retried, but only one cycle
      expect(messageApi.sendCount, 1);

      outbox.dispose();
    });
  });
}
