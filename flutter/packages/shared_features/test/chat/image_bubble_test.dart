import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  group('ImageBubble', () {
    testWidgets('renders placeholder when url is empty', (tester) async {
      const message = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ImageBubble(message: message, isMe: true),
          ),
        ),
      );

      expect(find.byIcon(Icons.broken_image), findsOneWidget);
    });

    testWidgets('does not crash when mediaUrl is null and tapped',
        (tester) async {
      const message = Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ImageBubble(message: message, isMe: false),
          ),
        ),
      );

      await tester.tap(find.byType(GestureDetector));
      await tester.pump();

      expect(find.byType(ImageBubble), findsOneWidget);
    });

    testWidgets('renders network image when url is present', (tester) async {
      const message = Message(
        id: 'm3',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
        mediaUrl: 'https://example.com/photo.png',
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ImageBubble(message: message, isMe: true),
          ),
        ),
      );

      expect(find.byType(Image), findsOneWidget);
    });
  });
}
