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

  group('Desktop file bubble', () {
    testWidgets('tapping open on unsupported file does not crash',
        (tester) async {
      const message = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'FILE',
        content: '',
        sendTime: '2026-01-01T00:00:00Z',
        status: 'SENT',
        mediaName: 'unknown.xyz',
        mediaSize: 1234,
        mediaUrl: 'https://example.com/unknown.xyz',
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
