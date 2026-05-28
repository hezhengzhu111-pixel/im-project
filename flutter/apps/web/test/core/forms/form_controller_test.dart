import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';

void main() {
  FormSchema _testSchema() => FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [
            FormValidators.required('required'),
            FormValidators.minLength(3, 'min 3'),
          ],
        ),
        FormFieldSchema(
          name: 'email',
          validators: [
            FormValidators.required('required'),
            FormValidators.email('invalid email'),
          ],
        ),
      ]);

  group('FormController', () {
    test('creates fields from schema', () {
      final controller = FormController(_testSchema());
      expect(controller.field('username').value, '');
      expect(controller.field('email').value, '');
    });

    test('values returns current field values', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'john');
      expect(controller.values, {'username': 'john', 'email': ''});
    });

    test('validate returns true when all fields valid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'john');
      controller.updateField('email', 'test@example.com');
      expect(await controller.validate(), isTrue);
    });

    test('validate returns false when any field invalid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      expect(await controller.validate(), isFalse);
      expect(controller.field('username').error, 'min 3');
    });

    test('validateField validates single field', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      await controller.validateField('username');
      expect(controller.field('username').error, 'min 3');
    });

    test('validateField clears error when valid', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      await controller.validateField('username');
      expect(controller.field('username').error, 'min 3');
      controller.updateField('username', 'abc');
      await controller.validateField('username');
      expect(controller.field('username').error, isNull);
    });

    test('updateField runs validators when touched', () {
      final controller = FormController(_testSchema());
      controller.touchField('username');
      controller.updateField('username', 'ab');
      expect(controller.field('username').error, 'min 3');
    });

    test('updateField does not run validators when not touched', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      expect(controller.field('username').error, isNull);
    });

    test('touchField marks field as touched', () {
      final controller = FormController(_testSchema());
      controller.touchField('username');
      expect(controller.field('username').touched, isTrue);
    });

    test('touchField runs validators', () {
      final controller = FormController(_testSchema());
      controller.updateField('username', '');
      controller.touchField('username');
      expect(controller.field('username').error, 'required');
    });

    test('applyServerErrors sets field errors', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({'email': 'already taken'});
      expect(controller.field('email').error, 'already taken');
    });

    test('applyServerErrors sets formError for unknown fields', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({}, formError: 'network error');
      expect(controller.formError, 'network error');
    });

    test('applyServerErrors ignores unknown field names', () {
      final controller = FormController(_testSchema());
      controller.applyServerErrors({'unknown': 'error'});
      expect(controller.field('username').error, isNull);
    });

    test('reset clears all fields and formError', () async {
      final controller = FormController(_testSchema());
      controller.updateField('username', 'ab');
      controller.touchField('username');
      await controller.validateField('username');
      controller.applyServerErrors({}, formError: 'err');
      controller.reset();
      expect(controller.field('username').value, '');
      expect(controller.field('username').error, isNull);
      expect(controller.field('username').touched, isFalse);
      expect(controller.formError, isNull);
    });

    test('notifies listeners on updateField', () {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      controller.updateField('username', 'new');
      expect(notified, isTrue);
    });

    test('notifies listeners on validateField', () async {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      await controller.validateField('username');
      expect(notified, isTrue);
    });

    test('notifies listeners on applyServerErrors', () {
      final controller = FormController(_testSchema());
      var notified = false;
      controller.addListener(() => notified = true);
      controller.applyServerErrors({'username': 'taken'});
      expect(notified, isTrue);
    });

    test('formError is null by default', () {
      final controller = FormController(_testSchema());
      expect(controller.formError, isNull);
    });

    group('formError management', () {
      test('setFormError sets formError', () {
        final controller = FormController(_testSchema());
        controller.setFormError('Test error');
        expect(controller.formError, 'Test error');
      });

      test('setFormError notifies listeners', () {
        final controller = FormController(_testSchema());
        var notified = false;
        controller.addListener(() => notified = true);
        controller.setFormError('Test error');
        expect(notified, isTrue);
      });

      test('clearFormError clears formError', () {
        final controller = FormController(_testSchema());
        controller.setFormError('Test error');
        controller.clearFormError();
        expect(controller.formError, isNull);
      });

      test('clearFormError notifies listeners', () {
        final controller = FormController(_testSchema());
        controller.setFormError('Test error');
        var notified = false;
        controller.addListener(() => notified = true);
        controller.clearFormError();
        expect(notified, isTrue);
      });

      test('applyServerErrors uses setFormError internally', () {
        final controller = FormController(_testSchema());
        controller.applyServerErrors({}, formError: 'network error');
        expect(controller.formError, 'network error');
      });
    });

    test('validate runs async validator when sync passes', () async {
      final completer = Completer<Validator?>();
      final schema = FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [FormValidators.required('required')],
          asyncValidatorFactory: () async => completer.future,
        ),
      ]);
      final controller = FormController(schema);
      controller.updateField('username', 'john');

      final future = controller.validate();
      expect(controller.field('username').pending, isTrue);

      completer.complete(null);
      await future;

      expect(controller.field('username').pending, isFalse);
      expect(controller.field('username').error, isNull);
    });

    test('validate skips async validator when sync fails', () async {
      final schema = FormSchema(fields: [
        FormFieldSchema(
          name: 'username',
          validators: [FormValidators.required('required')],
          asyncValidatorFactory: () async => (value) => 'async error',
        ),
      ]);
      final controller = FormController(schema);
      await controller.validate();
      expect(controller.field('username').error, 'required');
      expect(controller.field('username').pending, isFalse);
    });
  });
}
