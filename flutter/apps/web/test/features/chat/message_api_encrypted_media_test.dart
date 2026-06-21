import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/message_api.dart';

import '../../helpers/fakes.dart';

void main() {
  test('sendPrivateEncrypted preserves media fields for encrypted sessions',
      () async {
    final http = FakeHttpClientPort();
    Map<String, dynamic>? capturedBody;

    http.onPost = <T>(
      String path, {
      dynamic body,
      required T Function(Map<String, dynamic>) fromJson,
    }) async {
      expect(path, MessageEndpoints.sendPrivate);
      capturedBody = Map<String, dynamic>.from(body as Map);
      return ApiResponse<T>(
        code: 200,
        message: 'ok',
        data: fromJson({
          'id': 'server-1',
          'senderId': 'user-1',
          'receiverId': 'user-2',
          'isGroupChat': false,
          'messageType': 'IMAGE',
          'content': '',
          'sendTime': '2026-01-01T00:00:00Z',
          'status': 'SENT',
          'mediaUrl': 'https://example.com/image.png',
          'mediaName': 'image.png',
          'mediaSize': 1234,
          'thumbnailUrl': 'https://example.com/thumb.png',
          'encrypted': true,
        }),
      );
    };

    await MessageApi(http).sendPrivateEncrypted(
      receiverId: 'user-2',
      clientMessageId: 'client-1',
      messageType: 'IMAGE',
      e2eeEnvelope: const {
        'version': 2,
        'algorithm': 'rust-x25519-x3dh-dr-v1',
        'senderDeviceId': 'device-a',
        'recipientDeviceId': 'device-b',
        'sessionId': 'p_user-1_user-2',
        'wire': 'ciphertext',
      },
      e2eeDeviceId: 'device-a',
      mediaUrl: 'https://example.com/image.png',
      mediaName: 'image.png',
      mediaSize: 1234,
      thumbnailUrl: 'https://example.com/thumb.png',
    );

    expect(capturedBody, containsPair('encrypted', true));
    expect(capturedBody, isNot(contains('content')));
    expect(capturedBody,
        containsPair('mediaUrl', 'https://example.com/image.png'));
    expect(capturedBody, containsPair('mediaName', 'image.png'));
    expect(capturedBody, containsPair('mediaSize', 1234));
    expect(
      capturedBody,
      containsPair('thumbnailUrl', 'https://example.com/thumb.png'),
    );
  });

  test('sendPrivateEncrypted normalizes snake_case E2EE envelope for API',
      () async {
    final http = FakeHttpClientPort();
    Map<String, dynamic>? capturedBody;

    http.onPost = <T>(
      String path, {
      dynamic body,
      required T Function(Map<String, dynamic>) fromJson,
    }) async {
      capturedBody = Map<String, dynamic>.from(body as Map);
      return ApiResponse<T>(
        code: 200,
        message: 'ok',
        data: fromJson({
          'id': 'server-1',
          'senderId': 'user-1',
          'receiverId': 'user-2',
          'isGroupChat': false,
          'messageType': 'TEXT',
          'content': '',
          'sendTime': '2026-01-01T00:00:00Z',
          'status': 'SENT',
          'encrypted': true,
        }),
      );
    };

    await MessageApi(http).sendPrivateEncrypted(
      receiverId: 'user-2',
      clientMessageId: 'client-1',
      messageType: 'TEXT',
      e2eeEnvelope: const {
        'version': 2,
        'algorithm': 'rust-x25519-x3dh-dr-v1',
        'sender_device_id': 'device-a',
        'recipient_device_id': 'device-b',
        'session_id': 'p_user-1_user-2',
        'wire': 'ciphertext',
      },
      e2eeDeviceId: 'device-a',
    );

    final envelope = capturedBody!['e2eeEnvelope'] as Map<String, dynamic>;
    expect(envelope['senderDeviceId'], 'device-a');
    expect(envelope['recipientDeviceId'], 'device-b');
    expect(envelope['sessionId'], 'p_user-1_user-2');
    expect(envelope, isNot(contains('sender_device_id')));
    expect(envelope, isNot(contains('recipient_device_id')));
    expect(envelope, isNot(contains('session_id')));
  });

  test('sendPrivateEncrypted sends batch envelopes without top-level envelope',
      () async {
    final http = FakeHttpClientPort();
    Map<String, dynamic>? capturedBody;

    http.onPost = <T>(
      String path, {
      dynamic body,
      required T Function(Map<String, dynamic>) fromJson,
    }) async {
      capturedBody = Map<String, dynamic>.from(body as Map);
      return ApiResponse<T>(
        code: 200,
        message: 'ok',
        data: fromJson({
          'id': 'server-1',
          'senderId': 'user-1',
          'receiverId': 'user-2',
          'isGroupChat': false,
          'messageType': 'TEXT',
          'content': '',
          'sendTime': '2026-01-01T00:00:00Z',
          'status': 'SENT',
          'encrypted': true,
        }),
      );
    };

    await MessageApi(http).sendPrivateEncrypted(
      receiverId: 'user-2',
      clientMessageId: 'client-1',
      messageType: 'TEXT',
      e2eeEnvelope: const {
        'version': 2,
        'algorithm': 'rust-x25519-x3dh-dr-v1',
        'senderDeviceId': 'device-a',
        'recipientDeviceId': 'device-b1',
        'sessionId': 'p_user-1_user-2',
        'wire': 'ciphertext-b1',
      },
      e2eeEnvelopes: const [
        {
          'recipientUserId': 'user-2',
          'recipientDeviceId': 'device-b1',
          'envelope': {
            'version': 2,
            'algorithm': 'rust-x25519-x3dh-dr-v1',
            'senderDeviceId': 'device-a',
            'recipientDeviceId': 'device-b1',
            'sessionId': 'p_user-1_user-2',
            'wire': 'ciphertext-b1',
          },
        },
        {
          'recipientUserId': 'user-2',
          'recipientDeviceId': 'device-b2',
          'envelope': {
            'version': 2,
            'algorithm': 'rust-x25519-x3dh-dr-v1',
            'senderDeviceId': 'device-a',
            'recipientDeviceId': 'device-b2',
            'sessionId': 'p_user-1_user-2',
            'wire': 'ciphertext-b2',
          },
        },
      ],
      e2eeDeviceId: 'device-a',
    );

    expect(capturedBody, isNot(contains('e2eeEnvelope')));
    final envelopes = capturedBody!['e2eeEnvelopes'] as List<dynamic>;
    expect(envelopes, hasLength(2));
    expect(
      (envelopes[1] as Map<String, dynamic>)['recipientDeviceId'],
      'device-b2',
    );
  });
}
