import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/widgets/validated_form.dart';

void main() {
  group('ValidatedForm', () {
    testWidgets('provides controller via InheritedWidget', (tester) async {
      final controller = FormController(
        FormSchema(fields: [
          FormFieldSchema(name: 'field1'),
        ]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            child: Builder(
              builder: (context) {
                final provided = ValidatedForm.of(context);
                return Text(provided.field('field1').value.isEmpty
                    ? 'empty'
                    : 'has value');
              },
            ),
          ),
        ),
      );

      expect(find.text('empty'), findsOneWidget);
    });

    testWidgets('rebuilds children when controller notifies', (tester) async {
      final controller = FormController(
        FormSchema(fields: [
          FormFieldSchema(name: 'field1'),
        ]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            child: Builder(
              builder: (context) {
                final provided = ValidatedForm.of(context);
                return Text(provided.field('field1').value.isEmpty
                    ? 'empty'
                    : 'filled');
              },
            ),
          ),
        ),
      );

      expect(find.text('empty'), findsOneWidget);

      controller.updateField('field1', 'hello');
      await tester.pump();

      expect(find.text('filled'), findsOneWidget);
    });

    testWidgets('shows FormErrorBanner by default', (tester) async {
      final controller = FormController(
        FormSchema(fields: [FormFieldSchema(name: 'field1')]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            child: const SizedBox(),
          ),
        ),
      );

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsOneWidget);
    });

    testWidgets('hides FormErrorBanner when showErrorBanner is false',
        (tester) async {
      final controller = FormController(
        FormSchema(fields: [FormFieldSchema(name: 'field1')]),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: ValidatedForm(
            controller: controller,
            showErrorBanner: false,
            child: const SizedBox(),
          ),
        ),
      );

      controller.setFormError('Test error');
      await tester.pumpAndSettle();

      expect(find.text('Test error'), findsNothing);
    });
  });
}
