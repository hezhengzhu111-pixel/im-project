import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('Message media fields', () {
    test('parses image message with all media fields', () {
      final json = {
        'id': '100',
        'senderId': '1',
        'receiverId': '2',
        'isGroupChat': false,
        'messageType': 'IMAGE',
        'content': '',
        'sendTime': '2026-06-22T06:00:00Z',
        'status': 'SENT',
        'mediaUrl': 'https://example.com/photo.png',
        'mediaName': 'photo.png',
        'mediaSize': 1024,
        'thumbnailUrl': 'https://example.com/photo-thumb.png',
      };

      final message = Message.fromJson(json);
      expect(message.messageType, 'IMAGE');
      expect(message.mediaUrl, 'https://example.com/photo.png');
      expect(message.mediaName, 'photo.png');
      expect(message.mediaSize, 1024);
      expect(message.thumbnailUrl, 'https://example.com/photo-thumb.png');
    });

    test('parses file message with minimal fields', () {
      final json = {
        'id': '101',
        'senderId': '1',
        'receiverId': '2',
        'isGroupChat': false,
        'messageType': 'FILE',
        'content': '',
        'sendTime': '2026-06-22T06:00:00Z',
        'status': 'SENT',
        'mediaName': 'document.pdf',
        'mediaSize': 2048,
      };

      final message = Message.fromJson(json);
      expect(message.messageType, 'FILE');
      expect(message.mediaUrl, isNull);
      expect(message.mediaName, 'document.pdf');
      expect(message.mediaSize, 2048);
    });

    test('handles missing media fields gracefully', () {
      final json = {
        'id': '102',
        'senderId': '1',
        'receiverId': '2',
        'isGroupChat': false,
        'messageType': 'IMAGE',
        'content': '',
        'sendTime': '2026-06-22T06:00:00Z',
        'status': 'SENT',
      };

      final message = Message.fromJson(json);
      expect(message.mediaUrl, isNull);
      expect(message.mediaSize, isNull);
      expect(message.mediaName, isNull);
    });

    test('normalizes snake_case media fields', () {
      final json = {
        'id': '103',
        'sender_id': '1',
        'is_group_chat': false,
        'message_type': 'FILE',
        'content': '',
        'created_time': '2026-06-22T06:00:00Z',
        'status': 'SENT',
        'media_url': 'https://example.com/file.zip',
        'media_name': 'file.zip',
        'media_size': 4096,
      };

      final message = Message.fromJson(json);
      expect(message.mediaUrl, 'https://example.com/file.zip');
      expect(message.mediaName, 'file.zip');
      expect(message.mediaSize, 4096);
    });
  });
}
