import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_sembast.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_core/core.dart';
import 'package:mockito/mockito.dart';

/// Manual mock for MessageApi since code generation has analyzer compatibility issues.
class MockMessageApi extends Mock implements MessageApi {
  MockMessageApi();

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    return super.noSuchMethod(
      Invocation.method(#sendPrivateMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
      returnValueForMissingStub: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    return super.noSuchMethod(
      Invocation.method(#sendGroupMessage, [request]),
      returnValue: Future.value(_createDummyMessage()),
      returnValueForMissingStub: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
  }) async {
    return super.noSuchMethod(
      Invocation.method(#sendPrivateEncrypted, [], {
        #receiverId: receiverId,
        #clientMessageId: clientMessageId,
        #messageType: messageType,
        #e2eeEnvelope: e2eeEnvelope,
        #e2eeDeviceId: e2eeDeviceId,
      }),
      returnValue: Future.value(_createDummyMessage()),
      returnValueForMissingStub: Future.value(_createDummyMessage()),
    ) as Future<Message>;
  }

  Message _createDummyMessage() {
    return const Message(
      id: 'server-msg-1',
      senderId: 'user-1',
      isGroupChat: false,
      messageType: 'text',
      content: '',
      sendTime: '2024-01-01T00:00:00Z',
      status: 'sent',
    );
  }
}

void main() {
  late MessageOutbox outbox;
  late MockMessageApi mockMessageApi;

  setUp(() {
    mockMessageApi = MockMessageApi();
  });

  tearDown(() async {
    if (outbox != null) {
      await outbox!.clearAll();
      outbox!.dispose();
    }
  });

  group('MessageOutbox Integration', () {
    test('enqueue adds message to outbox with pending status', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => false,
      );
      await outbox.initialize();

      final message = await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Hello World',
        messageType: 'text',
        clientMessageId: 'client-msg-1',
      );

      expect(message.status, OutboxMessageStatus.pending);
      expect(message.content, 'Hello World');
      expect(message.sessionKey, 'session-1');
      expect(message.receiverId, 'user-2');
      expect(message.clientMessageId, 'client-msg-1');
      expect(await outbox.getPendingCount(), 1);
    });

    test('enqueue multiple messages increments pending count', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => false,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Message 1',
        clientMessageId: 'client-1',
      );

      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Message 2',
        clientMessageId: 'client-2',
      );

      expect(await outbox.getPendingCount(), 2);
    });
  });
}
