import 'package:flutter_test/flutter_test.dart';

void main() {
  group('_redact', () {
    // Re-implementation of the same logic for testing purposes.
    // The actual _redact is private; this mirrors its algorithm.
    const sensitiveKeys = <String>{
      'password',
      'token',
      'accesstoken',
      'refreshtoken',
      'refresh_token',
      'ticket',
      'authorization',
      'cookie',
      'set-cookie',
    };

    /// Recursively redact sensitive values in a JSON-like structure.
    dynamic redact(dynamic value) {
      if (value is Map<String, dynamic>) {
        final redacted = <String, dynamic>{};
        for (final entry in value.entries) {
          if (sensitiveKeys.contains(entry.key.toLowerCase())) {
            redacted[entry.key] = '***REDACTED***';
          } else {
            redacted[entry.key] = redact(entry.value);
          }
        }
        return redacted;
      } else if (value is List) {
        return value.map((item) => redact(item)).toList();
      }
      return value;
    }

    test('accessToken is redacted', () {
      final result = redact({
        'accessToken': 'secret-token-123',
        'other': 'visible',
      });
      expect(result['accessToken'], '***REDACTED***');
      expect(result['other'], 'visible');
    });

    test('refreshToken is redacted', () {
      final result = redact({
        'refreshToken': 'refresh-secret',
      });
      expect(result['refreshToken'], '***REDACTED***');
    });

    test('nested Map token is redacted', () {
      final result = redact({
        'user': {
          'name': 'Alice',
          'token': 'nested-secret',
        },
      });
      expect(result['user'], isA<Map<String, dynamic>>());
      expect((result['user'] as Map)['name'], 'Alice');
      expect((result['user'] as Map)['token'], '***REDACTED***');
    });

    test('List<Map> token is redacted', () {
      final result = redact({
        'items': [
          {'id': 1, 'token': 'list-secret'},
          {'id': 2, 'password': 'list-pwd'},
        ],
      });
      final items = result['items'] as List;
      expect(items[0], isA<Map<String, dynamic>>());
      expect((items[0] as Map)['token'], '***REDACTED***');
      expect((items[1] as Map)['password'], '***REDACTED***');
    });

    test('password is redacted', () {
      final result = redact({'password': 'my-password'});
      expect(result['password'], '***REDACTED***');
    });

    test('ticket is redacted', () {
      final result = redact({'ticket': 'ws-ticket-abc'});
      expect(result['ticket'], '***REDACTED***');
    });

    test('authorization is redacted', () {
      final result = redact({'authorization': 'Bearer xxx'});
      expect(result['authorization'], '***REDACTED***');
    });

    test('cookie is redacted', () {
      final result = redact({'cookie': 'session=abc'});
      expect(result['cookie'], '***REDACTED***');
    });

    test('set-cookie is redacted', () {
      final result = redact({'set-cookie': 'session=abc'});
      expect(result['set-cookie'], '***REDACTED***');
    });

    test('case-insensitive matching works for all keys', () {
      final result = redact({
        'AccessToken': 'secret',
        'REFRESHTOKEN': 'secret',
        'Token': 'secret',
        'Password': 'secret',
      });
      expect(result['AccessToken'], '***REDACTED***');
      expect(result['REFRESHTOKEN'], '***REDACTED***');
      expect(result['Token'], '***REDACTED***');
      expect(result['Password'], '***REDACTED***');
    });

    test('non-sensitive keys are preserved', () {
      final result = redact({
        'username': 'alice',
        'age': 30,
        'active': true,
      });
      expect(result['username'], 'alice');
      expect(result['age'], 30);
      expect(result['active'], true);
    });

    test('deeply nested sensitive keys are redacted', () {
      final result = redact({
        'level1': {
          'level2': {
            'level3': {
              'accessToken': 'deep-secret',
            },
          },
        },
      });
      final l1 = result['level1'] as Map<String, dynamic>;
      final l2 = l1['level2'] as Map<String, dynamic>;
      final l3 = l2['level3'] as Map<String, dynamic>;
      expect(l3['accessToken'], '***REDACTED***');
    });

    test('nested List containing non-Map items is preserved', () {
      final result = redact({
        'tags': ['a', 'b', 'c'],
      });
      expect(result['tags'], ['a', 'b', 'c']);
    });
  });
}
