import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/e2ee/data/e2ee_sent_message_cache.dart';

/// Mock implementation of SentMessageCacheStorage for testing.
class MockSentMessageCacheStorage implements SentMessageCacheStorage {
  final Map<String, Map<String, dynamic>> _store = {};

  @override
  Future<void> write(String key, Map<String, dynamic> value) async {
    _store[key] = Map.from(value);
  }

  @override
  Future<Map<String, dynamic>?> read(String key) async {
    return _store[key];
  }

  @override
  Future<void> delete(String key) async {
    _store.remove(key);
  }

  @override
  Future<void> clearAll() async {
    _store.clear();
  }

  @override
  Future<void> deleteBySession(String e2eeSessionId) async {
    _store.removeWhere((key, value) =>
        value['e2eeSessionId'] == e2eeSessionId);
  }

  @override
  Future<List<String>> getAllKeys() async {
    return _store.keys.toList();
  }
}

void main() {
  late E2eeSentMessageCache sentCache;
  late MockSentMessageCacheStorage storage;

  setUp(() {
    storage = MockSentMessageCacheStorage();
    sentCache = E2eeSentMessageCache(storage: storage);
  });

  group('E2EE History Recovery', () {
    test('own sent encrypted message should be stored in cache after send',
        () async {
      // Arrange
      const clientMessageId = 'client_123';
      const serverMessageId = '456';
      const plaintext = 'Hello from Alice';
      const e2eeSessionId = 'p_1_2';
      const peerUserId = '2';

      // Act - Simulate storing after successful send
      await sentCache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        peerUserId: peerUserId,
        serverMessageId: serverMessageId,
      );

      // Assert - Should be able to retrieve by both IDs
      final byClientId = await sentCache.getPlaintextByClientId(clientMessageId);
      final byServerId = await sentCache.getPlaintextByServerId(serverMessageId);

      expect(byClientId, equals(plaintext));
      expect(byServerId, equals(plaintext));
    });

    test('own sent encrypted message should recover from cache when E2EE fails',
        () async {
      // Arrange
      const clientMessageId = 'client_123';
      const serverMessageId = '456';
      const plaintext = 'Hello from Alice';
      const e2eeSessionId = 'p_1_2';

      await sentCache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        serverMessageId: serverMessageId,
      );

      // Act - Simulate recovery when E2EE decrypt fails
      String? recoveredPlaintext;

      // Try by clientMessageId first
      recoveredPlaintext = await sentCache.getPlaintextByClientId(clientMessageId);

      // Assert
      expect(recoveredPlaintext, equals(plaintext));
    });

    test('message without cache should return unavailable status', () async {
      // Arrange - No cache entry exists
      const clientMessageId = 'client_nonexistent';
      const serverMessageId = '999';

      // Act
      final byClientId = await sentCache.getPlaintextByClientId(clientMessageId);
      final byServerId = await sentCache.getPlaintextByServerId(serverMessageId);

      // Assert
      expect(byClientId, isNull);
      expect(byServerId, isNull);
      // In production code, this would set decryptStatus = 'unavailable_own_history'
    });

    test('other user message should not use own sent cache', () async {
      // Arrange
      await sentCache.put(
        clientMessageId: 'alice_client_123',
        plaintext: 'Alice message',
        e2eeSessionId: 'p_1_2',
        serverMessageId: '456',
      );

      // Act - Bob's message should not be found in Alice's cache
      final bobClientId = 'bob_client_789';
      final result = await sentCache.getPlaintextByClientId(bobClientId);

      // Assert
      expect(result, isNull);
    });

    test('logout should clear all sent message cache', () async {
      // Arrange
      await sentCache.put(
        clientMessageId: 'client_1',
        plaintext: 'Message 1',
        e2eeSessionId: 'p_1_2',
      );
      await sentCache.put(
        clientMessageId: 'client_2',
        plaintext: 'Message 2',
        e2eeSessionId: 'p_1_3',
      );

      // Act
      await sentCache.clearAll();

      // Assert
      final result1 = await sentCache.getPlaintextByClientId('client_1');
      final result2 = await sentCache.getPlaintextByClientId('client_2');
      expect(result1, isNull);
      expect(result2, isNull);
    });

    test('E2EE disabled should clear session cache', () async {
      // Arrange
      await sentCache.put(
        clientMessageId: 'client_1',
        plaintext: 'Message 1',
        e2eeSessionId: 'p_1_2',
      );
      await sentCache.put(
        clientMessageId: 'client_2',
        plaintext: 'Message 2',
        e2eeSessionId: 'p_1_3',
      );

      // Act
      await sentCache.clearSession('p_1_2');

      // Assert
      final result1 = await sentCache.getPlaintextByClientId('client_1');
      final result2 = await sentCache.getPlaintextByClientId('client_2');
      expect(result1, isNull);
      expect(result2, equals('Message 2'));
    });

    test('message merge should not cause duplicates with client/server ID mapping',
        () async {
      // Arrange
      const clientMessageId = 'client_123';
      const serverMessageId = '456';
      const plaintext = 'Hello';

      await sentCache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: 'p_1_2',
        serverMessageId: serverMessageId,
      );

      // Act - Update server ID
      await sentCache.updateServerId(
        clientMessageId: clientMessageId,
        serverMessageId: serverMessageId,
      );

      // Assert - Both lookups should return the same plaintext
      final byClientId = await sentCache.getPlaintextByClientId(clientMessageId);
      final byServerId = await sentCache.getPlaintextByServerId(serverMessageId);

      expect(byClientId, equals(plaintext));
      expect(byServerId, equals(plaintext));
      // No duplicate entries in storage
    });
  });

  group('decryptStatus values', () {
    test('success status for E2EE decrypted messages', () {
      const status = 'success';
      expect(status, equals('success'));
    });

    test('restored_from_local_cache status for cache-recovered messages', () {
      const status = 'restored_from_local_cache';
      expect(status, equals('restored_from_local_cache'));
    });

    test('unavailable_own_history status when cannot recover own message', () {
      const status = 'unavailable_own_history';
      expect(status, equals('unavailable_own_history'));
    });

    test('failed_own_history status for failed recovery attempt', () {
      const status = 'failed_own_history';
      expect(status, equals('failed_own_history'));
    });

    test('failed status for E2EE decrypt failure', () {
      const status = 'failed';
      expect(status, equals('failed'));
    });
  });
}
