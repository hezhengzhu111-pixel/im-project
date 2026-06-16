import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_mobile/features/chat/data/mobile_sent_message_cache.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeSecureStoragePort implements SecureStoragePort {
  final values = <String, String>{};

  @override
  Future<bool> containsKey(String key) async => values.containsKey(key);

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }

  @override
  Future<void> deleteAll() async {
    values.clear();
  }

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }
}

void main() {
  group('MobileSentMessageCache', () {
    late SharedPreferences prefs;
    late _FakeSecureStoragePort secureStorage;
    late DateTime now;
    late MobileSentMessageCache cache;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      secureStorage = _FakeSecureStoragePort();
      now = DateTime.fromMillisecondsSinceEpoch(100000);
      cache = MobileSentMessageCache(
        prefs,
        secureStorage,
        now: () => now,
        maxEntries: 2,
        ttlMs: 1000,
      );
    });

    test('stores plaintext only in secure storage', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'secret text',
        e2eeSessionId: 'session-1',
        serverMessageId: 'server-1',
      );

      expect(await cache.getPlaintextByClientId('client-1'), 'secret text');
      expect(await cache.getPlaintextByServerId('server-1'), 'secret text');
      expect(_prefsContain(prefs, 'secret text'), isFalse);
      expect(secureStorage.values.values.join('\n'), contains('secret text'));
    });

    test('updates server id without rewriting plaintext into prefs', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'plaintext after update',
        e2eeSessionId: 'session-1',
      );

      await cache.updateServerId('client-1', 'server-2');

      expect(
        await cache.getPlaintextByServerId('server-2'),
        'plaintext after update',
      );
      expect(_prefsContain(prefs, 'plaintext after update'), isFalse);
    });

    test('clears a single E2EE session', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'session one secret',
        e2eeSessionId: 'session-1',
      );
      await cache.put(
        clientMessageId: 'client-2',
        plaintext: 'session two secret',
        e2eeSessionId: 'session-2',
      );

      await cache.clearSession('session-1');

      expect(await cache.getPlaintextByClientId('client-1'), isNull);
      expect(
          await cache.getPlaintextByClientId('client-2'), 'session two secret');
      expect(_prefsContain(prefs, 'session one secret'), isFalse);
      expect(secureStorage.values.values.join('\n'),
          isNot(contains('session one secret')));
    });

    test('clearAll removes secure payloads and prefs metadata', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'clear all secret',
        e2eeSessionId: 'session-1',
      );

      await cache.clearAll();

      expect(await cache.getPlaintextByClientId('client-1'), isNull);
      expect(secureStorage.values, isEmpty);
      expect(_prefsContain(prefs, 'clear all secret'), isFalse);
      expect(prefs.getKeys(), isNot(contains('e2ee_sent_index')));
    });

    test('expires entries by TTL', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'ttl secret',
        e2eeSessionId: 'session-1',
      );

      now = now.add(const Duration(milliseconds: 1001));

      expect(await cache.getPlaintextByClientId('client-1'), isNull);
      expect(secureStorage.values.values.join('\n'),
          isNot(contains('ttl secret')));
    });

    test('trims oldest entries over max entries', () async {
      await cache.put(
        clientMessageId: 'client-1',
        plaintext: 'old secret',
        e2eeSessionId: 'session-1',
      );
      now = now.add(const Duration(milliseconds: 10));
      await cache.put(
        clientMessageId: 'client-2',
        plaintext: 'middle secret',
        e2eeSessionId: 'session-1',
      );
      now = now.add(const Duration(milliseconds: 10));
      await cache.put(
        clientMessageId: 'client-3',
        plaintext: 'new secret',
        e2eeSessionId: 'session-1',
      );

      expect(await cache.getPlaintextByClientId('client-1'), isNull);
      expect(await cache.getPlaintextByClientId('client-2'), 'middle secret');
      expect(await cache.getPlaintextByClientId('client-3'), 'new secret');
      expect(secureStorage.values.values.join('\n'),
          isNot(contains('old secret')));
    });

    test('migrates legacy SharedPreferences plaintext once', () async {
      final legacyEntry = jsonEncode({
        'clientMessageId': 'legacy-client',
        'plaintext': 'legacy secret',
        'e2eeSessionId': 'session-legacy',
        'serverMessageId': 'server-legacy',
        'createdAtMs': now.millisecondsSinceEpoch,
      });
      SharedPreferences.setMockInitialValues({
        'e2ee_sent_index': jsonEncode(['legacy-client']),
        'e2ee_sent_legacy-client': legacyEntry,
      });
      prefs = await SharedPreferences.getInstance();
      cache = MobileSentMessageCache(
        prefs,
        secureStorage,
        now: () => now,
        maxEntries: 2,
        ttlMs: 1000,
      );

      expect(
          await cache.getPlaintextByClientId('legacy-client'), 'legacy secret');
      expect(
          await cache.getPlaintextByServerId('server-legacy'), 'legacy secret');
      expect(prefs.getString('e2ee_sent_legacy-client'), isNull);
      expect(_prefsContain(prefs, 'legacy secret'), isFalse);
      expect(secureStorage.values.values.join('\n'), contains('legacy secret'));
    });
  });
}

bool _prefsContain(SharedPreferences prefs, String needle) {
  for (final key in prefs.getKeys()) {
    final value = prefs.get(key);
    if (value is String && value.contains(needle)) return true;
    if (value is List<String> && value.any((item) => item.contains(needle))) {
      return true;
    }
  }
  return false;
}
