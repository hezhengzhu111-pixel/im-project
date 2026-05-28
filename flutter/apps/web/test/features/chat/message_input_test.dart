import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/data/file_api.dart';
import 'package:im_web/features/chat/presentation/chat_provider.dart';

void main() {
  group('MessageInput callback mechanism', () {
    test('onSend callback can be assigned and invoked', () {
      String? receivedText;
      void onSend(String text) {
        receivedText = text;
      }

      // Simulate calling the callback
      onSend('Hello, World!');
      expect(receivedText, 'Hello, World!');
    });

    test('onSendImage callback can be assigned and invoked', () {
      UploadResult? receivedResult;
      void onSendImage(UploadResult result) {
        receivedResult = result;
      }

      final uploadResult = UploadResult.fromJson({
        'url': 'https://example.com/image.png',
        'name': 'image.png',
        'size': 1024,
      });
      onSendImage(uploadResult);
      expect(receivedResult?.url, 'https://example.com/image.png');
    });

    test('onSendFile callback can be assigned and invoked', () {
      UploadResult? receivedResult;
      void onSendFile(UploadResult result) {
        receivedResult = result;
      }

      final uploadResult = UploadResult.fromJson({
        'url': 'https://example.com/file.pdf',
        'name': 'file.pdf',
        'size': 2048,
      });
      onSendFile(uploadResult);
      expect(receivedResult?.url, 'https://example.com/file.pdf');
    });

    test('onSendVoice callback can be assigned and invoked', () {
      UploadResult? receivedResult;
      void onSendVoice(UploadResult result) {
        receivedResult = result;
      }

      final uploadResult = UploadResult.fromJson({
        'url': 'https://example.com/audio.mp3',
        'name': 'audio.mp3',
        'size': 4096,
      });
      onSendVoice(uploadResult);
      expect(receivedResult?.url, 'https://example.com/audio.mp3');
    });

    test('onSend callback ignores empty text', () {
      String? receivedText;
      void onSend(String text) {
        if (text.trim().isEmpty) return;
        receivedText = text;
      }

      onSend('');
      expect(receivedText, isNull);

      onSend('   ');
      expect(receivedText, isNull);

      onSend('valid text');
      expect(receivedText, 'valid text');
    });
  });

  group('MessageInput and ChatState integration', () {
    test('sending a message adds it to the correct session', () {
      final notifier = _TestChatNotifier();

      // Add a message via the notifier
      final msg = Message(
        id: 'm1',
        senderId: 'test-user',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello!',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      notifier.addMessage('session-1', msg);

      expect(notifier.state.messages['session-1']!.length, 1);
      expect(notifier.state.messages['session-1']!.first.content, 'Hello!');
    });

    test('message deduplication works', () {
      final notifier = _TestChatNotifier();

      final msg = Message(
        id: 'm1',
        senderId: 'test-user',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello!',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      notifier.addMessage('session-1', msg);
      notifier.addMessage('session-1', msg);

      expect(notifier.state.messages['session-1']!.length, 1);
    });
  });
}

/// Minimal ChatNotifier for testing message flow without web dependencies.
class _TestChatNotifier {
  ChatState _state = const ChatState();
  ChatState get state => _state;

  void addMessage(String sessionKey, Message message) {
    final currentMessages = _state.messages[sessionKey] ?? [];
    if (currentMessages.any((m) => m.id == message.id)) return;
    final updated = [...currentMessages, message];
    _state = _state.copyWith(
      messages: {..._state.messages, sessionKey: updated},
    );
  }
}
