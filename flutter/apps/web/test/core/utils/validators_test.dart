import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/utils/validators.dart';

void main() {
  group('Validators', () {
    group('validateUsername', () {
      test('should return error for empty username', () {
        expect(Validators.validateUsername(null), '请输入用户名');
        expect(Validators.validateUsername(''), '请输入用户名');
      });

      test('should return error for username too short', () {
        expect(Validators.validateUsername('ab'), '用户名长度在 3 到 20 个字符');
      });

      test('should return error for username too long', () {
        expect(Validators.validateUsername('a' * 21), '用户名长度在 3 到 20 个字符');
      });

      test('should return error for invalid characters', () {
        expect(Validators.validateUsername('user@name'), '用户名只能包含字母、数字和下划线');
      });

      test('should return null for valid username', () {
        expect(Validators.validateUsername('username'), null);
        expect(Validators.validateUsername('user_name'), null);
        expect(Validators.validateUsername('user123'), null);
      });
    });

    group('validateEmail', () {
      test('should return error for empty email', () {
        expect(Validators.validateEmail(null), '请输入邮箱');
        expect(Validators.validateEmail(''), '请输入邮箱');
      });

      test('should return error for invalid email', () {
        expect(Validators.validateEmail('invalid'), '请输入正确的邮箱格式');
        expect(Validators.validateEmail('invalid@'), '请输入正确的邮箱格式');
      });

      test('should return null for valid email', () {
        expect(Validators.validateEmail('test@example.com'), null);
      });
    });

    group('validatePassword', () {
      test('should return error for empty password', () {
        expect(Validators.validatePassword(null), '请输入密码');
        expect(Validators.validatePassword(''), '请输入密码');
      });

      test('should return error for password too short', () {
        expect(Validators.validatePassword('1234567'), '密码长度在 8 到 64 个字符');
      });

      test('should return error for password without letters', () {
        expect(Validators.validatePassword('12345678'), '密码必须包含字母和数字');
      });

      test('should return error for password without numbers', () {
        expect(Validators.validatePassword('abcdefgh'), '密码必须包含字母和数字');
      });

      test('should return null for valid password', () {
        expect(Validators.validatePassword('password123'), null);
      });
    });

    group('validateConfirmPassword', () {
      test('should return error for empty confirm password', () {
        expect(Validators.validateConfirmPassword(null, 'password'), '请确认密码');
        expect(Validators.validateConfirmPassword('', 'password'), '请确认密码');
      });

      test('should return error for mismatched passwords', () {
        expect(Validators.validateConfirmPassword('different', 'password'), '两次输入密码不一致');
      });

      test('should return null for matching passwords', () {
        expect(Validators.validateConfirmPassword('password', 'password'), null);
      });
    });
  });
}
