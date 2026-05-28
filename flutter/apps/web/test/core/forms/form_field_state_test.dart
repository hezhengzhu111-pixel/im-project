import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/form_field_state.dart';

void main() {
  group('FormFieldState', () {
    test('initializes with default value', () {
      final field = FormFieldState(name: 'username');
      expect(field.value, '');
      expect(field.error, isNull);
      expect(field.touched, isFalse);
      expect(field.dirty, isFalse);
      expect(field.pending, isFalse);
      expect(field.isValid, isTrue);
      expect(field.hasValue, isFalse);
    });

    test('initializes with initial value', () {
      final field = FormFieldState(name: 'username', initialValue: 'hello');
      expect(field.value, 'hello');
      expect(field.hasValue, isTrue);
    });

    test('updateValue changes value and sets dirty', () {
      final field = FormFieldState(name: 'username');
      field.updateValue('new');
      expect(field.value, 'new');
      expect(field.dirty, isTrue);
    });

    test('updateValue with same value does not set dirty', () {
      final field = FormFieldState(name: 'username', initialValue: 'same');
      field.updateValue('same');
      expect(field.dirty, isFalse);
    });

    test('setError sets error', () {
      final field = FormFieldState(name: 'username');
      field.setError('required');
      expect(field.error, 'required');
      expect(field.isValid, isFalse);
    });

    test('setError with null clears error', () {
      final field = FormFieldState(name: 'username');
      field.setError('required');
      field.setError(null);
      expect(field.error, isNull);
      expect(field.isValid, isTrue);
    });

    test('touch sets touched', () {
      final field = FormFieldState(name: 'username');
      field.touch();
      expect(field.touched, isTrue);
    });

    test('setPending sets pending', () {
      final field = FormFieldState(name: 'username');
      field.setPending(true);
      expect(field.pending, isTrue);
      field.setPending(false);
      expect(field.pending, isFalse);
    });

    test('reset clears all state', () {
      final field = FormFieldState(name: 'username', initialValue: 'init');
      field.updateValue('changed');
      field.setError('err');
      field.touch();
      field.setPending(true);
      field.reset();
      expect(field.value, 'init');
      expect(field.error, isNull);
      expect(field.touched, isFalse);
      expect(field.dirty, isFalse);
      expect(field.pending, isFalse);
    });

    test('notifies listeners on updateValue', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.updateValue('new');
      expect(notified, isTrue);
    });

    test('notifies listeners on setError', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.setError('err');
      expect(notified, isTrue);
    });

    test('notifies listeners on touch', () {
      final field = FormFieldState(name: 'username');
      var notified = false;
      field.addListener(() => notified = true);
      field.touch();
      expect(notified, isTrue);
    });
  });
}
