import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/forms/server_error_mapper.dart';

void main() {
  group('ServerErrorMapper', () {
    test('maps field errors from response with errors object', () {
      final response = {
        'code': 422,
        'errors': {
          'email': ['已被注册'],
          'username': ['太短'],
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], '已被注册');
      expect(result.fieldErrors['username'], '太短');
      expect(result.formError, isNull);
    });

    test('takes first message when errors has array', () {
      final response = {
        'errors': {
          'email': ['error1', 'error2'],
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], 'error1');
    });

    test('maps formError from message field', () {
      final response = {
        'code': 400,
        'message': '网络异常',
      };
      final result = ServerErrorMapper.map(response);
      expect(result.formError, '网络异常');
      expect(result.fieldErrors, isEmpty);
    });

    test('maps formError from detail field', () {
      final response = {
        'detail': '服务器内部错误',
      };
      final result = ServerErrorMapper.map(response);
      expect(result.formError, '服务器内部错误');
    });

    test('fieldAlias renames field keys', () {
      final response = {
        'errors': {
          'user_name': ['太短'],
        },
      };
      final result = ServerErrorMapper.map(
        response,
        fieldAlias: {'user_name': 'username'},
      );
      expect(result.fieldErrors['username'], '太短');
      expect(result.fieldErrors.containsKey('user_name'), isFalse);
    });

    test('returns empty errors for null response', () {
      final result = ServerErrorMapper.map(null);
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('returns empty errors for non-map response', () {
      final result = ServerErrorMapper.map('string response');
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('returns empty errors for empty map', () {
      final result = ServerErrorMapper.map({});
      expect(result.fieldErrors, isEmpty);
      expect(result.formError, isNull);
    });

    test('handles errors with non-list values', () {
      final response = {
        'errors': {
          'email': 'single error string',
        },
      };
      final result = ServerErrorMapper.map(response);
      expect(result.fieldErrors['email'], 'single error string');
    });
  });
}
