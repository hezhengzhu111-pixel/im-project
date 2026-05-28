import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';

void main() {
  FormController _controller() => FormController(
        FormSchema(fields: [
          FormFieldSchema(
            name: 'username',
            validators: [FormValidators.required('required')],
          ),
        ]),
      );

  Widget _build(FormController controller) {
    return MaterialApp(
      home: Scaffold(
        body: ValidatedForm(
          controller: controller,
          child: ValidatedFormField(
            controller: controller,
            name: 'username',
            label: 'Username',
            icon: Icons.person,
          ),
        ),
      ),
    );
  }

  group('ValidatedFormField', () {
    testWidgets('renders TextFormField with label', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));
      expect(find.byType(TextFormField), findsOneWidget);
      expect(find.text('Username'), findsOneWidget);
    });

    testWidgets('does not show error before touch', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      await controller.validate();
      await tester.pump();

      expect(find.text('required'), findsNothing);
    });

    testWidgets('shows error after touch and validation', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      controller.touchField('username');
      await tester.pump();

      expect(find.text('required'), findsOneWidget);
    });

    testWidgets('updates field value on input', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      await tester.enterText(find.byType(TextFormField), 'john');
      await tester.pump();

      expect(controller.field('username').value, 'john');
    });

    testWidgets('clears error when value becomes valid', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      controller.touchField('username');
      await tester.pump();
      expect(find.text('required'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField), 'john');
      await tester.pump();

      expect(find.text('required'), findsNothing);
    });

    testWidgets('shows loading indicator when pending', (tester) async {
      final controller = _controller();
      await tester.pumpWidget(_build(controller));

      controller.field('username').setPending(true);
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
