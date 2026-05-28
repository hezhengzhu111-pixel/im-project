import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/core/forms/form_field_state.dart';

void main() {
  group('FormValidators', () {
    group('required', () {
      test('returns error for null', () {
        expect(FormValidators.required('required')(null), 'required');
      });

      test('returns error for empty string', () {
        expect(FormValidators.required('required')(''), 'required');
      });

      test('returns error for whitespace only', () {
        expect(FormValidators.required('required')('   '), 'required');
      });

      test('returns null for valid value', () {
        expect(FormValidators.required('required')('hello'), isNull);
      });
    });

    group('minLength', () {
      test('returns error for short value', () {
        expect(FormValidators.minLength(3, 'too short')('ab'), 'too short');
      });

      test('returns null for value at min length', () {
        expect(FormValidators.minLength(3, 'too short')('abc'), isNull);
      });

      test('returns null for null value', () {
        expect(FormValidators.minLength(3, 'too short')(null), isNull);
      });
    });

    group('maxLength', () {
      test('returns error for long value', () {
        expect(FormValidators.maxLength(5, 'too long')('abcdef'), 'too long');
      });

      test('returns null for value at max length', () {
        expect(FormValidators.maxLength(5, 'too long')('abcde'), isNull);
      });

      test('returns null for null value', () {
        expect(FormValidators.maxLength(5, 'too long')(null), isNull);
      });
    });

    group('pattern', () {
      test('returns error for non-matching value', () {
        final validator = FormValidators.pattern(RegExp(r'^\d+$'), 'digits only');
        expect(validator('abc'), 'digits only');
      });

      test('returns null for matching value', () {
        final validator = FormValidators.pattern(RegExp(r'^\d+$'), 'digits only');
        expect(validator('123'), isNull);
      });
    });

    group('email', () {
      test('returns error for invalid email', () {
        expect(FormValidators.email('invalid')('not-email'), 'invalid');
      });

      test('returns null for valid email', () {
        expect(FormValidators.email('invalid')('test@example.com'), isNull);
      });
    });

    group('passwordStrength', () {
      test('returns error for digits only', () {
        expect(FormValidators.passwordStrength('weak')('12345678'), 'weak');
      });

      test('returns error for letters only', () {
        expect(FormValidators.passwordStrength('weak')('abcdefgh'), 'weak');
      });

      test('returns null for letters and digits', () {
        expect(FormValidators.passwordStrength('weak')('abc12345'), isNull);
      });
    });

    group('sameAs', () {
      test('returns error when values differ', () {
        final other = FormFieldState(name: 'password', initialValue: 'pass1');
        expect(FormValidators.sameAs(other, 'mismatch')('pass2'), 'mismatch');
      });

      test('returns null when values match', () {
        final other = FormFieldState(name: 'password', initialValue: 'pass1');
        expect(FormValidators.sameAs(other, 'mismatch')('pass1'), isNull);
      });
    });

    group('asyncUniqueUsername', () {
      test('returns null (placeholder)', () async {
        final validator = await FormValidators.asyncUniqueUsername('taken');
        expect(validator, isNull);
      });
    });
  });

  group('composeValidators', () {
    test('returns null when all validators pass', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
      ]);
      expect(composed('hello'), isNull);
    });

    test('returns first error encountered', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
      ]);
      expect(composed(null), 'required');
    });

    test('stops at first error', () {
      final composed = composeValidators([
        FormValidators.required('required'),
        FormValidators.minLength(3, 'short'),
        FormValidators.maxLength(5, 'long'),
      ]);
      expect(composed('ab'), 'short');
    });

    test('returns null for empty validator list', () {
      final composed = composeValidators([]);
      expect(composed('anything'), isNull);
    });
  });
}
