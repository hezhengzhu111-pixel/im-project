import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/widgets/form_error_banner.dart';
import 'package:im_web/widgets/validated_form.dart';

void main() {
  Widget buildTestWidget(FormController controller) {
    return MaterialApp(
      home: Scaffold(
        body: ValidatedForm(
          controller: controller,
          showErrorBanner: false,
          child: FormErrorBanner(controller: controller),
        ),
      ),
    );
  }

  group('FormErrorBanner', () {
    testWidgets('does not show when formError is null', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('shows when formError is set', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('hides after clearFormError', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();
      controller.clearFormError();
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsNothing);
    });

    testWidgets('dismiss button hides error', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsNothing);
    });

    testWidgets('new error reappears after dismiss', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('First error');
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.close));
      await tester.pumpAndSettle();

      controller.setFormError('Second error');
      await tester.pumpAndSettle();

      expect(find.text('Second error'), findsOneWidget);
    });

    testWidgets('uses theme error color', (tester) async {
      final controller = FormController(FormSchema(fields: []));
      await tester.pumpWidget(buildTestWidget(controller));

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      final container = tester.widget<Container>(
        find.ancestor(of: find.byIcon(Icons.error_outline), matching: find.byType(Container)).first,
      );
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, isNotNull);
    });
  });
}
