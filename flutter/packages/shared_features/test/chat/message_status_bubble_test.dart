import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  Widget buildBubble(Message message, {bool isMe = true, VoidCallback? onRetry}) {
    return MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: MessageBubble(message: message, isMe: isMe, onRetry: onRetry),
      ),
    );
  }

  group('MessageBubble status display', () {
    testWidgets('SENT message shows check icon', (tester) async {
      const message = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
      );

      await tester.pumpWidget(buildBubble(message));
      expect(find.byIcon(Icons.check), findsOneWidget);
    });

    testWidgets('READ message shows done_all icon', (tester) async {
      const message = Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'READ',
      );

      await tester.pumpWidget(buildBubble(message));
      expect(find.byIcon(Icons.done_all), findsOneWidget);
    });

    testWidgets('FAILED message shows error icon when no onRetry', (tester) async {
      const message = Message(
        id: 'm3',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'FAILED',
      );

      await tester.pumpWidget(buildBubble(message));
      expect(find.byIcon(Icons.error_outline), findsWidgets);
    });

    testWidgets('FAILED message shows retry button when onRetry provided',
        (tester) async {
      const message = Message(
        id: 'm4',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'FAILED',
      );

      var retried = false;
      await tester.pumpWidget(buildBubble(message, onRetry: () => retried = true));
      expect(find.byIcon(Icons.refresh), findsOneWidget);

      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pump();
      expect(retried, isTrue);
    });

    testWidgets('SENDING message shows access_time icon', (tester) async {
      const message = Message(
        id: 'm5',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENDING',
      );

      await tester.pumpWidget(buildBubble(message));
      expect(find.byIcon(Icons.access_time), findsOneWidget);
    });

    testWidgets('PENDING message shows access_time icon', (tester) async {
      const message = Message(
        id: 'm6',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'PENDING',
      );

      await tester.pumpWidget(buildBubble(message));
      expect(find.byIcon(Icons.access_time), findsOneWidget);
    });
  });

  group('MessageBubble RECALLED status', () {
    testWidgets('RECALLED text message shows recalled placeholder', (tester) async {
      const message = Message(
        id: 'm10',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Original content that should not be visible',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'RECALLED',
      );

      await tester.pumpWidget(buildBubble(message));

      // Should show recalled placeholder text.
      expect(find.text('Message recalled'), findsOneWidget);
      // Should NOT show original content.
      expect(find.text('Original content that should not be visible'), findsNothing);
      // Should show info icon.
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
      // Should NOT show status icon.
      expect(find.byIcon(Icons.check), findsNothing);
      expect(find.byIcon(Icons.done_all), findsNothing);
      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('RECALLED image message does not show image', (tester) async {
      const message = Message(
        id: 'm11',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'IMAGE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'RECALLED',
        mediaUrl: 'https://example.com/photo.png',
      );

      await tester.pumpWidget(buildBubble(message));

      // Should show recalled placeholder.
      expect(find.text('Message recalled'), findsOneWidget);
      // Should NOT show image.
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('RECALLED file message does not show file bubble', (tester) async {
      const message = Message(
        id: 'm12',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'RECALLED',
        mediaUrl: 'https://example.com/doc.pdf',
        mediaName: 'doc.pdf',
      );

      await tester.pumpWidget(buildBubble(message));

      // Should show recalled placeholder.
      expect(find.text('Message recalled'), findsOneWidget);
      // Should NOT show file name.
      expect(find.text('doc.pdf'), findsNothing);
    });

    testWidgets('RECALLED message does not show retry button even for own message',
        (tester) async {
      const message = Message(
        id: 'm13',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'recalled',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'RECALLED',
      );

      await tester.pumpWidget(buildBubble(message, onRetry: () {}));

      // Should NOT show retry button.
      expect(find.byIcon(Icons.refresh), findsNothing);
    });

    testWidgets('RECALLED message shows time but no status icon', (tester) async {
      const message = Message(
        id: 'm14',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'recalled',
        sendTime: '2026-01-01T12:30:00Z',
        status: 'RECALLED',
      );

      await tester.pumpWidget(buildBubble(message));

      // Should show time.
      expect(find.text('12:30'), findsOneWidget);
      // Should NOT show any status icon.
      expect(find.byIcon(Icons.access_time), findsNothing);
    });

    testWidgets('non-own RECALLED message shows recalled placeholder', (tester) async {
      const message = Message(
        id: 'm15',
        senderId: 'u2',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'someone else recalled',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'RECALLED',
      );

      await tester.pumpWidget(buildBubble(message, isMe: false));

      expect(find.text('Message recalled'), findsOneWidget);
      expect(find.text('someone else recalled'), findsNothing);
    });
  });

  group('MessageBubble unknown status', () {
    testWidgets('unknown status shows access_time as fallback', (tester) async {
      const message = Message(
        id: 'm20',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'TEXT',
        content: 'Hello',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'UNKNOWN_STATUS',
      );

      await tester.pumpWidget(buildBubble(message));

      // Should show the content (not crash).
      expect(find.text('Hello'), findsOneWidget);
      // Default icon is access_time.
      expect(find.byIcon(Icons.access_time), findsOneWidget);
    });
  });
}
