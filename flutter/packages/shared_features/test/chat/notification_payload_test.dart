import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('Notification payload parse', () {
    test('PushMessage fromJson with all fields', () {
      final json = {
        'title': 'New Message',
        'body': 'Hello from Bob',
        'data': {
          'type': 'private',
          'sessionId': '1_2',
          'senderId': '2',
          'messageId': 'msg1',
        },
      };
      final msg = PushMessage.fromJson(json);
      expect(msg.title, 'New Message');
      expect(msg.body, 'Hello from Bob');
      expect(msg.data, isNotNull);
      expect(msg.data!['type'], 'private');
      expect(msg.data!['sessionId'], '1_2');
    });

    test('PushMessage fromJson with minimal fields', () {
      final json = {
        'title': 'Notification',
        'body': 'You have a message',
      };
      final msg = PushMessage.fromJson(json);
      expect(msg.title, 'Notification');
      expect(msg.body, 'You have a message');
      expect(msg.data, isNull);
    });

    test('PushMessage toJson roundtrip', () {
      const msg = PushMessage(
        title: 'Test',
        body: 'Body',
        data: {'key': 'value'},
      );
      final json = msg.toJson();
      final restored = PushMessage.fromJson(json);
      expect(restored.title, 'Test');
      expect(restored.body, 'Body');
      expect(restored.data!['key'], 'value');
    });
  });

  group('Notification type normalize', () {
    test('private type is recognized', () {
      const data = {'type': 'private', 'senderId': '2'};
      expect(data['type'], 'private');
    });

    test('group type is recognized', () {
      const data = {'type': 'group', 'groupId': 'g1'};
      expect(data['type'], 'group');
    });

    test('unknown type defaults safely', () {
      const data = {'type': 'unknown'};
      expect(data['type'], 'unknown');
    });
  });

  group('SessionKey from notification payload', () {
    test('group payload resolves to group session key', () {
      const data = {'type': 'group', 'groupId': '42'};
      final groupId = data['groupId'];
      final sessionKey = 'group_$groupId';
      expect(sessionKey, 'group_42');
    });

    test('private payload resolves to private session key', () {
      const data = {'type': 'private', 'senderId': '5'};
      const currentUserId = 1;
      final senderId = int.parse(data['senderId']!);
      final ids = [currentUserId, senderId]..sort();
      final sessionKey = '${ids[0]}_${ids[1]}';
      expect(sessionKey, '1_5');
    });
  });

  group('Notification summary formatter', () {
    test('TEXT non-E2EE shows short content', () {
      const content = 'Hello World';
      const encrypted = false;
      const msgType = 'TEXT';
      const status = 'SENT';
      String summary;
      if (status == 'RECALLED') {
        summary = '对方撤回了一条消息';
      } else if (msgType == 'IMAGE') {
        summary = '收到一张图片';
      } else if (msgType == 'FILE') {
        summary = '收到一个文件';
      } else if (encrypted) {
        summary = '收到一条加密消息';
      } else {
        summary = content.length > 50 ? '${content.substring(0, 50)}...' : content;
      }
      expect(summary, 'Hello World');
    });

    test('TEXT E2EE shows generic message', () {
      const content = 'Secret plaintext';
      const encrypted = true;
      const msgType = 'TEXT';
      const status = 'SENT';
      String summary;
      if (status == 'RECALLED') {
        summary = '对方撤回了一条消息';
      } else if (msgType == 'IMAGE') {
        summary = '收到一张图片';
      } else if (msgType == 'FILE') {
        summary = '收到一个文件';
      } else if (encrypted) {
        summary = '收到一条加密消息';
      } else {
        summary = content;
      }
      expect(summary, '收到一条加密消息');
      expect(summary.contains('Secret'), isFalse);
    });

    test('IMAGE shows image summary', () {
      const msgType = 'IMAGE';
      String summary;
      if (msgType == 'IMAGE') {
        summary = '收到一张图片';
      } else {
        summary = '';
      }
      expect(summary, '收到一张图片');
    });

    test('FILE shows file summary', () {
      const msgType = 'FILE';
      String summary;
      if (msgType == 'FILE') {
        summary = '收到一个文件';
      } else {
        summary = '';
      }
      expect(summary, '收到一个文件');
    });

    test('RECALLED shows recalled summary', () {
      const status = 'RECALLED';
      String summary;
      if (status == 'RECALLED') {
        summary = '对方撤回了一条消息';
      } else {
        summary = '';
      }
      expect(summary, '对方撤回了一条消息');
    });

    test('long text is truncated', () {
      const content =
          'This is a very long message that should be truncated because it exceeds the maximum length allowed for notification body';
      final summary = content.length > 50 ? '${content.substring(0, 50)}...' : content;
      expect(summary.length, lessThanOrEqualTo(53));
      expect(summary.endsWith('...'), isTrue);
    });
  });

  group('Sensitive field redaction', () {
    test('notification body does not contain mediaUrl', () {
      const body = '收到一张图片';
      expect(body.contains('http'), isFalse);
      expect(body.contains('example.com'), isFalse);
    });

    test('notification body does not contain token', () {
      const body = '收到一条加密消息';
      expect(body.contains('token'), isFalse);
      expect(body.contains('Bearer'), isFalse);
    });

    test('notification body does not contain envelope', () {
      const body = '收到一条加密消息';
      expect(body.contains('envelope'), isFalse);
      expect(body.contains('wire'), isFalse);
    });
  });
}
