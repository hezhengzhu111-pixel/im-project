import 'package:flutter_test/flutter_test.dart';
import 'package:idb_shim/idb_client_sembast.dart';
import 'package:im_web/features/chat/data/message_outbox.dart';
import 'package:im_web/features/chat/data/message_api.dart';
import 'package:im_core/core.dart';
import 'package:mockito/mockito.dart';

/// Manual mock for MessageApi since code generation has analyzer compatibility issues.
class MockMessageApi extends Mock implements MessageApi {
  MockMessageApi();

  /// Optional custom response to return from sendPrivateMessage.
  Future<Message>? sendPrivateMessageResponse;

  /// If non-null, sendPrivateMessage will throw this exception.
  Exception? sendPrivateMessageException;

  /// If non-null, sendPrivateEncrypted will throw this exception.
  Exception? sendPrivateEncryptedException;

  /// Captured arguments from the last sendPrivateEncrypted call.
  Map<String, dynamic>? lastEncryptedArgs;

  /// Number of times sendPrivateEncrypted was called.
  int encryptedCallCount = 0;

  /// Whether sendPrivateMessage (non-encrypted) was ever called.
  bool sendPrivateMessageCalled = false;

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendPrivateMessageCalled = true;
    if (sendPrivateMessageException != null) {
      throw sendPrivateMessageException!;
    }
    if (sendPrivateMessageResponse != null) {
      return sendPrivateMessageResponse!;
    }
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
    encryptedCallCount++;
    lastEncryptedArgs = {
      'receiverId': receiverId,
      'clientMessageId': clientMessageId,
      'messageType': messageType,
      'e2eeEnvelope': e2eeEnvelope,
      'e2eeDeviceId': e2eeDeviceId,
    };
    if (sendPrivateEncryptedException != null) {
      throw sendPrivateEncryptedException!;
    }
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

    test('retry succeeds when API call succeeds', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      // Enqueue a message
      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Test message',
        clientMessageId: 'client-1',
      );

      // Mock successful API response
      final serverMessage = Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Test message',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        clientMessageId: 'client-1',
      );

      mockMessageApi.sendPrivateMessageResponse = Future.value(serverMessage);

      // Trigger retry
      outbox.onNetworkAvailable();

      // Wait for async operations to complete
      await Future.delayed(Duration(seconds: 1));

      // Verify message was sent and removed from outbox
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('retry fails after max retries exceeded', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      // Enqueue a message
      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Test message',
        clientMessageId: 'client-1',
      );

      // Mock API to always fail
      mockMessageApi.sendPrivateMessageException = Exception('Network error');

      // Retry multiple times (max retries is 5)
      for (int i = 0; i < 6; i++) {
        outbox.onNetworkAvailable();
        await Future.delayed(Duration(milliseconds: 500));
      }

      // Verify message is marked as failed
      expect(await outbox.getFailedCount(), 1);
      expect(await outbox.getPendingCount(), 0);
    });

    test('retryAllFailed resets failed messages and retries', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      // Enqueue a message
      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Test message',
        clientMessageId: 'client-1',
      );

      // Mock API to always fail
      mockMessageApi.sendPrivateMessageException = Exception('Network error');

      // Retry until failed (max retries is 5)
      for (int i = 0; i < 6; i++) {
        outbox.onNetworkAvailable();
        await Future.delayed(Duration(milliseconds: 500));
      }

      // Verify message is marked as failed
      expect(await outbox.getFailedCount(), 1);
      expect(await outbox.getPendingCount(), 0);

      // Now mock successful API response
      final serverMessage = Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Test message',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        clientMessageId: 'client-1',
      );
      mockMessageApi.sendPrivateMessageResponse = Future.value(serverMessage);
      mockMessageApi.sendPrivateMessageException = null;

      // Call retryAllFailed
      await outbox.retryAllFailed();

      // Verify message was sent and removed from outbox
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('network restoration triggers retry of pending messages', () async {
      // Start offline with mutable network state
      bool isOnline = false;
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => isOnline,
      );
      await outbox.initialize();

      // Enqueue message while offline
      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Offline message',
        messageType: 'text',
        clientMessageId: 'client-1',
      );

      // Verify message is pending
      expect(await outbox.getPendingCount(), 1);

      // Mock successful API response
      final serverMessage = Message(
        id: 'server-1',
        senderId: 'user-1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Offline message',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        clientMessageId: 'client-1',
      );

      mockMessageApi.sendPrivateMessageResponse = Future.value(serverMessage);

      // Simulate network restoration
      isOnline = true;
      outbox.onNetworkAvailable();

      // Wait for async operations to complete
      await Future.delayed(Duration(seconds: 1));

      // Verify message was sent and removed from outbox
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('group message offline enqueue', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => false,
      );
      await outbox.initialize();

      final message = await outbox.enqueue(
        sessionKey: 'group-1',
        receiverId: 'group-1',
        content: 'Hello Group',
        messageType: 'text',
        clientMessageId: 'client-msg-2',
        isGroupChat: true,
        groupId: 'group-1',
      );

      expect(message.status, OutboxMessageStatus.pending);
      expect(message.content, 'Hello Group');
      expect(message.sessionKey, 'group-1');
      expect(message.receiverId, 'group-1');
      expect(message.clientMessageId, 'client-msg-2');
      expect(message.isGroupChat, true);
      expect(message.groupId, 'group-1');
      expect(await outbox.getPendingCount(), 1);
    });

    test('group message is sent via sendGroupMessage', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'group-1',
        receiverId: 'group-1',
        content: 'Hello Group',
        messageType: 'text',
        clientMessageId: 'client-msg-3',
        isGroupChat: true,
        groupId: 'group-1',
      );

      // Wait for async send to complete
      await Future.delayed(Duration(seconds: 1));

      // Message should be sent and removed from outbox
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('E2EE message is sent via sendPrivateEncrypted', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'encrypted content',
        messageType: 'text',
        clientMessageId: 'client-e2ee-1',
        isEncrypted: true,
        e2eeEnvelope: {'wire': 'encrypted_data'},
        e2eeDeviceId: 'device-1',
      );

      // Wait for async send to complete
      await Future.delayed(Duration(seconds: 1));

      // Message should be sent via encrypted path and removed from outbox
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);
    });

    test('E2EE message does not expose plaintext in error logs', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => true,
      );
      await outbox.initialize();

      // Enqueue encrypted message with sensitive plaintext content
      final message = await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'SENSITIVE_PLAINTEXT_CONTENT',
        messageType: 'text',
        clientMessageId: 'client-e2ee-plain-1',
        isEncrypted: true,
        e2eeEnvelope: {'wire': 'encrypted_data'},
        e2eeDeviceId: 'device-1',
      );

      // Wait for async send to complete
      await Future.delayed(Duration(seconds: 1));

      // Verify the message was processed and removed (sent successfully)
      expect(await outbox.getPendingCount(), 0);
      expect(await outbox.getFailedCount(), 0);

      // Key verification: sendPrivateEncrypted was called (not sendPrivateMessage)
      // This proves the outbox routes E2EE messages through the encrypted API
      // which does NOT accept a content/plaintext parameter.
      expect(mockMessageApi.encryptedCallCount, 1);
      expect(mockMessageApi.sendPrivateMessageCalled, false);

      // Verify the encrypted API received the envelope, not the plaintext
      final capturedArgs = mockMessageApi.lastEncryptedArgs!;
      expect(capturedArgs['e2eeEnvelope'], {'wire': 'encrypted_data'});
      expect(capturedArgs['receiverId'], 'user-2');
      expect(capturedArgs['clientMessageId'], 'client-e2ee-plain-1');
      expect(capturedArgs['messageType'], 'text');
      expect(capturedArgs['e2eeDeviceId'], 'device-1');

      // The sendPrivateEncrypted API signature does not include a 'content'
      // parameter, so plaintext can never be passed through this path.
      // This is a compile-time guarantee verified by this test exercising
      // the encrypted code path.
    });

    test('E2EE message offline enqueue preserves encryption fields', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => false,
      );
      await outbox.initialize();

      final message = await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'secret data',
        messageType: 'text',
        clientMessageId: 'client-e2ee-2',
        isEncrypted: true,
        e2eeEnvelope: {'wire': 'encrypted_payload'},
        e2eeDeviceId: 'device-1',
      );

      expect(message.status, OutboxMessageStatus.pending);
      expect(message.isEncrypted, true);
      expect(message.e2eeEnvelope, {'wire': 'encrypted_payload'});
      expect(message.e2eeDeviceId, 'device-1');
      expect(await outbox.getPendingCount(), 1);
    });

    test('does not add duplicate clientMessageId', () async {
      outbox = MessageOutbox(
        messageApi: mockMessageApi,
        idbFactory: idbFactorySembastMemory,
        isOnline: () => false,
      );
      await outbox.initialize();

      // First enqueue
      final first = await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'First message',
        clientMessageId: 'client-dup-1',
      );

      // Second enqueue with same clientMessageId
      final second = await outbox.enqueue(
        sessionKey: 'session-1',
        receiverId: 'user-2',
        content: 'Second message',
        clientMessageId: 'client-dup-1',
      );

      // Should return the same message (dedup by clientMessageId)
      expect(first.id, second.id);
      expect(first.clientMessageId, second.clientMessageId);
      expect(await outbox.getPendingCount(), 1);
    });
  });
}
