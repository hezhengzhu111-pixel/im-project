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

  group('FileBubble', () {
    testWidgets('renders file name, size and type label',
        (tester) async {
      const message = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
        mediaName: 'report.pdf',
        mediaSize: 2048,
        mediaUrl: 'https://example.com/report.pdf',
      );

      await tester.pumpWidget(
        buildTestable(const FileBubble(message: message, isMe: true)),
      );

      expect(find.text('report.pdf'), findsOneWidget);
      expect(find.text('2.0 KB'), findsOneWidget);
      expect(find.text('PDF'), findsOneWidget);
    });

    testWidgets('renders placeholder when mediaName is missing',
        (tester) async {
      const message = Message(
        id: 'm2',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
      );

      await tester.pumpWidget(
        buildTestable(const FileBubble(message: message, isMe: false)),
      );

      expect(find.byType(IconButton), findsOneWidget);
    });

    testWidgets('does not crash when mediaUrl is null', (tester) async {
      const message = Message(
        id: 'm3',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'FAILED',
        mediaName: 'missing.txt',
      );

      await tester.pumpWidget(
        buildTestable(const FileBubble(message: message, isMe: true)),
      );

      await tester.tap(find.byType(IconButton));
      await tester.pump();

      expect(find.byType(FileBubble), findsOneWidget);
    });
  });
}
