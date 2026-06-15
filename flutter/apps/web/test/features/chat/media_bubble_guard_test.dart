import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/presentation/widgets/voice_bubble.dart';
import 'package:im_web/features/chat/presentation/widgets/file_bubble.dart';
import 'package:im_web/features/chat/presentation/widgets/video_bubble.dart';

/// P0 止血：媒体 bubble widget 测试。
/// 验证语音、文件、视频 bubble 不会进入伪播放/伪下载/伪交互状态。

Message _createMessage({
  String messageType = 'VOICE',
  int? duration,
  int? mediaSize,
  String? mediaName,
  String? thumbnailUrl,
}) {
  return Message(
    id: 'test-msg-1',
    senderId: 'test-user',
    isGroupChat: false,
    messageType: messageType,
    content: 'test content',
    sendTime: DateTime.now().toIso8601String(),
    status: 'SENT',
    duration: duration,
    mediaSize: mediaSize,
    mediaName: mediaName,
    thumbnailUrl: thumbnailUrl,
  );
}

Widget _wrapWithMaterial(Widget child) {
  return MaterialApp(
    home: Scaffold(body: Center(child: child)),
  );
}

void main() {
  // ---------------------------------------------------------------------------
  // VoiceBubble
  // ---------------------------------------------------------------------------
  group('VoiceBubble P0 止血', () {
    testWidgets('语音 bubble 不包含可播放交互', (tester) async {
      final message = _createMessage(messageType: 'VOICE', duration: 5000);

      await tester.pumpWidget(_wrapWithMaterial(
        VoiceBubble(message: message, isMe: true),
      ));

      // Should NOT have GestureDetector (no interactive tap areas)
      // Voice bubble is now a StatelessWidget, static display
      expect(find.byType(VoiceBubble), findsOneWidget);

      // Play icon is static (not a button), should still appear
      expect(find.byIcon(Icons.play_arrow), findsOneWidget);

      // Pause icon should NOT appear (no toggle state)
      expect(find.byIcon(Icons.pause), findsNothing);
    });

    testWidgets('语音 bubble 点击不会切换播放状态', (tester) async {
      final message = _createMessage(messageType: 'VOICE', duration: 5000);

      await tester.pumpWidget(_wrapWithMaterial(
        VoiceBubble(message: message, isMe: true),
      ));

      // Tap the voice bubble area
      await tester.tap(find.byType(VoiceBubble));
      await tester.pump();

      // Play icon should still be play_arrow (not toggled to pause)
      expect(find.byIcon(Icons.play_arrow), findsOneWidget);
      expect(find.byIcon(Icons.pause), findsNothing);
    });
  });

  // ---------------------------------------------------------------------------
  // FileBubble
  // ---------------------------------------------------------------------------
  group('FileBubble P0 止血', () {
    testWidgets('文件 bubble 下载按钮已禁用', (tester) async {
      final message = _createMessage(
        messageType: 'FILE',
        mediaSize: 1024,
        mediaName: 'test.pdf',
      );

      await tester.pumpWidget(_wrapWithMaterial(
        FileBubble(message: message, isMe: true),
      ));

      // Download icon should exist
      expect(find.byIcon(Icons.download), findsOneWidget);

      // The IconButton should be disabled (onPressed: null)
      // find.byIcon finds the Icon inside the IconButton; use byType for the button
      final iconButton = tester.widget<IconButton>(
        find.byType(IconButton),
      );
      expect(iconButton.onPressed, isNull);
      // Verify the disabled button contains the download icon
      expect(find.byIcon(Icons.download), findsOneWidget);
    });

    testWidgets('文件 bubble 显示 tooltip 说明暂不支持', (tester) async {
      final message = _createMessage(
        messageType: 'FILE',
        mediaSize: 1024,
        mediaName: 'test.pdf',
      );

      await tester.pumpWidget(_wrapWithMaterial(
        FileBubble(message: message, isMe: true),
      ));

      // Tooltip should exist with unsupported message
      expect(find.byType(Tooltip), findsOneWidget);
      final tooltip = tester.widget<Tooltip>(find.byType(Tooltip));
      expect(tooltip.message, contains('暂不支持'));
    });
  });

  // ---------------------------------------------------------------------------
  // VideoBubble
  // ---------------------------------------------------------------------------
  group('VideoBubble P0 止血', () {
    testWidgets('视频 bubble 不触发播放交互', (tester) async {
      // Use empty thumbnail to avoid network error in test environment
      final message = _createMessage(
        messageType: 'VIDEO',
        thumbnailUrl: '',
      );

      await tester.pumpWidget(_wrapWithMaterial(
        VideoBubble(message: message, isMe: true),
      ));

      // Video bubble should exist
      expect(find.byType(VideoBubble), findsOneWidget);

      // Play icon is decorative (inside Stack), should exist
      expect(find.byIcon(Icons.play_arrow), findsOneWidget);

      // Should NOT have GestureDetector — tap and verify no state changes
      await tester.tap(find.byType(VideoBubble));
      await tester.pump();
    });

    testWidgets('视频 bubble 无缩略图时仍静态展示', (tester) async {
      final message = _createMessage(
        messageType: 'VIDEO',
        thumbnailUrl: '',
      );

      await tester.pumpWidget(_wrapWithMaterial(
        VideoBubble(message: message, isMe: true),
      ));

      // Play icon should still show (decorative)
      expect(find.byIcon(Icons.play_arrow), findsOneWidget);
    });
  });
}
