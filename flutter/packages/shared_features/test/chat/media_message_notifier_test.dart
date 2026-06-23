import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

import '../helpers/fakes.dart';

class _FakeMessageApi extends MessageApi {
  _FakeMessageApi() : super(_FakeHttpClientPort());

  final _config = const MessageConfig(textEnforce: false, textMaxLength: 2000);

  Exception? privateException;
  Exception? groupException;
  Message? privateResponse;
  Message? groupResponse;

  int sendPrivateMessageCallCount = 0;
  int sendGroupMessageCallCount = 0;
  int sendPrivateEncryptedCallCount = 0;
  SendPrivateMessageRequest? lastPrivateRequest;
  SendGroupMessageRequest? lastGroupRequest;

  @override
  Future<MessageConfig> getConfig() async => _config;

  @override
  Future<List<ChatSession>> getConversations() async => [];

  @override
  Future<List<Message>> getPrivateHistory(
    String friendId, {
    int? page,
    int? size,
    String? deviceId,
  }) async =>
      [];

  @override
  Future<List<Message>> getGroupHistory(
    String groupId, {
    int? page,
    int? size,
  }) async =>
      [];

  @override
  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    sendPrivateMessageCallCount++;
    lastPrivateRequest = request;
    if (privateException != null) throw privateException!;
    return privateResponse ?? _dummyMessage(request.clientMessageId);
  }

  @override
  Future<Message> sendGroupMessage(SendGroupMessageRequest request) async {
    sendGroupMessageCallCount++;
    lastGroupRequest = request;
    if (groupException != null) throw groupException!;
    return groupResponse ??
        _dummyMessage(request.clientMessageId, isGroupChat: true);
  }

  @override
  Future<Message> sendPrivateEncrypted({
    required String receiverId,
    required String clientMessageId,
    required String messageType,
    required Map<String, dynamic> e2eeEnvelope,
    required String e2eeDeviceId,
    List<Map<String, dynamic>>? e2eeEnvelopes,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration,
  }) async {
    sendPrivateEncryptedCallCount++;
    if (privateException != null) throw privateException!;
    return privateResponse ?? _dummyMessage(clientMessageId);
  }

  Message _dummyMessage(String? clientMessageId, {bool isGroupChat = false}) =>
      Message(
        id: 'server-id',
        senderId: 'u1',
        receiverId: isGroupChat ? '' : 'u2',
        isGroupChat: isGroupChat,
        messageType: 'TEXT',
        content: '',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        clientMessageId: clientMessageId,
      );
}

class _FakeHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError();
}

class _RecordingOutboxPort implements OutboxPort {
  final _events = StreamController<OutboxEvent>.broadcast();
  final List<OutboxMessage> enqueued = [];

  @override
  Stream<OutboxEvent> get events => _events.stream;

  @override
  Future<int> getPendingCount() async => 0;

  @override
  Future<int> getFailedCount() async => 0;

  @override
  Future<void> enqueue(OutboxMessage message) async {
    enqueued.add(message);
    _events.add(const OutboxEvent(type: OutboxEventType.messageAdded));
  }

  @override
  Future<void> retryAllFailed(
    Future<Message?> Function(OutboxMessage message) sender,
  ) async {}

  @override
  Future<void> clearAll() async {}

  void dispose() => _events.close();
}

void main() {
  group('ChatNotifier media messages', () {
    late _FakeMessageApi messageApi;
    late _RecordingOutboxPort outbox;
    late ChatNotifier notifier;

    setUp(() {
      messageApi = _FakeMessageApi();
      outbox = _RecordingOutboxPort();
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        FakeWsClient(),
        () => 'u1',
        outbox: outbox,
      );
    });

    tearDown(() {
      notifier.dispose();
      outbox.dispose();
    });

    test('sendMessage with IMAGE type carries media metadata', () async {
      await notifier.sendMessage(
        'u2',
        '',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.png',
        mediaName: 'photo.png',
        mediaSize: 1024,
        thumbnailUrl: 'https://example.com/photo-thumb.png',
      );

      expect(messageApi.sendPrivateMessageCallCount, 1);
      final req = messageApi.lastPrivateRequest!;
      expect(req.messageType, 'IMAGE');
      expect(req.mediaUrl, 'https://example.com/photo.png');
      expect(req.mediaName, 'photo.png');
      expect(req.mediaSize, 1024);
      expect(req.thumbnailUrl, 'https://example.com/photo-thumb.png');
    });

    test('sendMessage with FILE type carries media metadata', () async {
      await notifier.sendMessage(
        'u2',
        '',
        messageType: 'FILE',
        mediaUrl: 'https://example.com/doc.pdf',
        mediaName: 'doc.pdf',
        mediaSize: 2048,
      );

      expect(messageApi.sendPrivateMessageCallCount, 1);
      final req = messageApi.lastPrivateRequest!;
      expect(req.messageType, 'FILE');
      expect(req.mediaUrl, 'https://example.com/doc.pdf');
      expect(req.mediaSize, 2048);
    });

    test('sendGroupMessage with FILE type sends unencrypted', () async {
      await notifier.sendGroupMessage(
        'g1',
        '',
        messageType: 'FILE',
        mediaUrl: 'https://example.com/group.pdf',
        mediaName: 'group.pdf',
        mediaSize: 4096,
      );

      expect(messageApi.sendGroupMessageCallCount, 1);
      final req = messageApi.lastGroupRequest!;
      expect(req.messageType, 'FILE');
      expect(req.mediaUrl, 'https://example.com/group.pdf');
      expect(req.mediaSize, 4096);
    });

    test('media send failure enqueues outbox with media fields', () async {
      messageApi.privateException = Exception('SocketException');
      await notifier.sendMessage(
        'u2',
        '',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.png',
        mediaName: 'photo.png',
        mediaSize: 1024,
      );

      expect(outbox.enqueued, hasLength(1));
      final outboxMsg = outbox.enqueued.first;
      expect(outboxMsg.messageType, 'IMAGE');
      expect(outboxMsg.mediaUrl, 'https://example.com/photo.png');
      expect(outboxMsg.mediaName, 'photo.png');
      expect(outboxMsg.mediaSize, 1024);
      expect(outboxMsg.clientMessageId, isNotNull);

      final sessionKey = notifier.state.messages.keys.first;
      final local = notifier.state.messages[sessionKey]!.first;
      expect(local.status, 'PENDING');
    });

    test('retrying media preserves clientMessageId', () async {
      messageApi.privateException = Exception('SocketException');
      await notifier.sendMessage(
        'u2',
        '',
        messageType: 'FILE',
        mediaUrl: 'https://example.com/doc.pdf',
        mediaName: 'doc.pdf',
        mediaSize: 2048,
      );
      final cid = outbox.enqueued.first.clientMessageId;
      outbox.enqueued.clear();

      await notifier.retryMessage('u2', cid);

      expect(outbox.enqueued, hasLength(1));
      expect(outbox.enqueued.first.clientMessageId, cid);
      expect(outbox.enqueued.first.mediaUrl, 'https://example.com/doc.pdf');
    });

    test('retrying encrypted media preserves e2ee metadata', () async {
      const cid = 'local-media-e2ee-1';
      notifier.state = notifier.state.copyWith(
        messages: {
          'u1_u2': [
            Message(
              id: cid,
              senderId: 'u1',
              receiverId: 'u2',
              isGroupChat: false,
              messageType: 'IMAGE',
              content: '',
              sendTime: DateTime.now().toIso8601String(),
              status: 'FAILED',
              clientMessageId: cid,
              encrypted: true,
              e2eeDeviceId: 'device-1',
              e2eeEnvelope: const E2eeEnvelope(
                version: 2,
                algorithm: 'rust-x25519-x3dh-dr-v1',
                senderDeviceId: 'device-1',
                recipientDeviceId: 'device-2',
                sessionId: 'p_u1_u2',
                wire: 'wire-data',
              ),
              mediaUrl: 'https://example.com/photo.png',
              mediaName: 'photo.png',
              mediaSize: 1024,
            ),
          ],
        },
      );

      await notifier.retryMessage('u1_u2', cid);

      expect(outbox.enqueued, hasLength(1));
      final outboxMsg = outbox.enqueued.first;
      expect(outboxMsg.isEncrypted, isTrue);
      expect(outboxMsg.e2eeDeviceId, 'device-1');
      expect(outboxMsg.e2eeEnvelope, isNotNull);
      expect(outboxMsg.e2eeEnvelope!['wire'], 'wire-data');
      expect(outboxMsg.mediaUrl, 'https://example.com/photo.png');
    });

    test('history recovery restores media metadata', () async {
      final historyMessage = Message(
        id: 'server-image-1',
        senderId: 'u2',
        receiverId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: DateTime.now().toIso8601String(),
        status: 'SENT',
        mediaUrl: 'https://example.com/history.png',
        mediaName: 'history.png',
        mediaSize: 512,
      );
      messageApi = _FakeMessageApi();
      messageApi.privateResponse = historyMessage;
      notifier = ChatNotifier(
        messageApi,
        MessagePipeline(),
        FakeWsClient(),
        () => 'u1',
      );

      // Directly inject the history response via state mutation to avoid
      // complex API wiring.
      notifier.state = notifier.state.copyWith(
        messages: {'u1_u2': [historyMessage]},
      );

      final messages = notifier.state.messages['u1_u2']!;
      expect(messages.first.mediaUrl, 'https://example.com/history.png');
      expect(messages.first.mediaName, 'history.png');
      expect(messages.first.mediaSize, 512);
    });
  });
}
