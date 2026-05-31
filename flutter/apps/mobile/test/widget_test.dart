import 'package:flutter_test/flutter_test.dart';
import 'package:im_mobile/app.dart';

void main() {
  testWidgets('App should render', (WidgetTester tester) async {
    await tester.pumpWidget(const App());
    await tester.pumpAndSettle();

    // 验证应用可以渲染
    expect(find.byType(App), findsOneWidget);
  });
}
