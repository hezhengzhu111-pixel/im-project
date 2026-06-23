import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  Widget buildTestable(Widget child) {
    return MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: child),
    );
  }

  group('Mobile media message UI smoke', () {
    testWidgets('image bubble renders', (tester) async {
      const message = Message(
        id: 'm1',
        senderId: 'u2',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
        mediaUrl: 'https://example.com/photo.png',
      );

      await tester.pumpWidget(
        buildTestable(const MessageBubble(message: message, isMe: false)),
      );

      expect(find.byType(ImageBubble), findsOneWidget);
    });

    testWidgets('file bubble renders with not-E2EE label', (tester) async {
      const message = Message(
        id: 'm2',
        senderId: 'u2',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
        mediaName: 'doc.pdf',
        mediaSize: 2048,
        mediaUrl: 'https://example.com/doc.pdf',
      );

      await tester.pumpWidget(
        buildTestable(const MessageBubble(message: message, isMe: false)),
      );

      expect(find.byType(FileBubble), findsOneWidget);
      expect(find.text('Media messages are not end-to-end encrypted'),
          findsOneWidget);
    });
  });
}
