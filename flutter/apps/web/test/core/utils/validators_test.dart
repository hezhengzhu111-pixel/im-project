import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/utils/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  final loc = AppLocalizations.delegate.build(const Locale('zh'));

  group('Validators', () {
    group('validateUsername', () {
      test('should return error for empty username', () {
        expect(Validators.validateUsername(null, loc), loc.validatorUsernameRequired);
        expect(Validators.validateUsername('', loc), loc.validatorUsernameRequired);
      });

      test('should return error for username too short', () {
        expect(Validators.validateUsername('ab', loc), loc.validatorUsernameLength);
      });

      test('should return error for username too long', () {
        expect(Validators.validateUsername('a' * 21, loc), loc.validatorUsernameLength);
      });

      test('should return error for invalid characters', () {
        expect(Validators.validateUsername('user@name', loc), loc.validatorUsernameFormat);
      });

      test('should return null for valid username', () {
        expect(Validators.validateUsername('username', loc), null);
        expect(Validators.validateUsername('user_name', loc), null);
        expect(Validators.validateUsername('user123', loc), null);
      });
    });

    group('validateEmail', () {
      test('should return error for empty email', () {
        expect(Validators.validateEmail(null, loc), loc.validatorEmailRequired);
        expect(Validators.validateEmail('', loc), loc.validatorEmailRequired);
      });

      test('should return error for invalid email', () {
        expect(Validators.validateEmail('invalid', loc), loc.validatorEmailFormat);
        expect(Validators.validateEmail('invalid@', loc), loc.validatorEmailFormat);
      });

      test('should return null for valid email', () {
        expect(Validators.validateEmail('test@example.com', loc), null);
      });
    });

    group('validatePassword', () {
      test('should return error for empty password', () {
        expect(Validators.validatePassword(null, loc), loc.validatorPasswordRequired);
        expect(Validators.validatePassword('', loc), loc.validatorPasswordRequired);
      });

      test('should return error for password too short', () {
        expect(Validators.validatePassword('1234567', loc), loc.validatorPasswordLength);
      });

      test('should return error for password without letters', () {
        expect(Validators.validatePassword('12345678', loc), loc.validatorPasswordFormat);
      });

      test('should return error for password without numbers', () {
        expect(Validators.validatePassword('abcdefgh', loc), loc.validatorPasswordFormat);
      });

      test('should return null for valid password', () {
        expect(Validators.validatePassword('password123', loc), null);
      });
    });

    group('validateConfirmPassword', () {
      test('should return error for empty confirm password', () {
        expect(Validators.validateConfirmPassword(null, 'password', loc), loc.validatorConfirmPasswordRequired);
        expect(Validators.validateConfirmPassword('', 'password', loc), loc.validatorConfirmPasswordRequired);
      });

      test('should return error for mismatched passwords', () {
        expect(Validators.validateConfirmPassword('different', 'password', loc), loc.validatorPasswordMismatch);
      });

      test('should return null for matching passwords', () {
        expect(Validators.validateConfirmPassword('password', 'password', loc), null);
      });
    });
  });
}
