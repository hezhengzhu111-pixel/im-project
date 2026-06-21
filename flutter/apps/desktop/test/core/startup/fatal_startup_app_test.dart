import 'package:flutter_test/flutter_test.dart';
import 'package:im_desktop/core/startup/fatal_startup_app.dart';

void main() {
  group('FatalStartupApp', () {
    testWidgets('displays rust bridge init failure message', (tester) async {
      await tester.pumpWidget(const FatalStartupApp(
        title: '客户端启动失败',
        message:
            'Rust Bridge 初始化失败。请检查安装包是否完整，或重新安装本客户端。',
      ));

      expect(find.text('客户端启动失败'), findsOneWidget);
      expect(
        find.text(
            'Rust Bridge 初始化失败。请检查安装包是否完整，或重新安装本客户端。'),
        findsOneWidget,
      );
    });

    testWidgets('does not expose stack trace or raw exception', (tester) async {
      await tester.pumpWidget(const FatalStartupApp(
        title: '客户端启动失败',
        message: 'Rust Bridge 初始化失败。',
      ));

      // No heavy technical details like "#0" or "Exception:" should leak.
      expect(find.textContaining('#0'), findsNothing);
      expect(find.textContaining('Exception:'), findsNothing);
    });
  });
}
