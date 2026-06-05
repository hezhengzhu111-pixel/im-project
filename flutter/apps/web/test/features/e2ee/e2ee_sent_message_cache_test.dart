import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/e2ee/data/e2ee_sent_message_cache.dart';

/// In-memory implementation of SentMessageCacheStorage for testing.
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
  late E2eeSentMessageCache cache;
  late MockSentMessageCacheStorage storage;

  setUp(() {
    storage = MockSentMessageCacheStorage();
    cache = E2eeSentMessageCache(storage: storage);
  });

  group('E2eeSentMessageCache', () {
    test('should store and retrieve plaintext by clientMessageId', () async {
      // Arrange
      const clientMessageId = 'client_123';
      const plaintext = 'Hello, World!';
      const e2eeSessionId = 'p_1_2';

      // Act
      await cache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
      );

      final result = await cache.getPlaintextByClientId(clientMessageId);

      // Assert
      expect(result, equals(plaintext));
    });

    test('should store and retrieve plaintext by serverMessageId', () async {
      // Arrange
      const clientMessageId = 'client_123';
      const serverMessageId = '456';
      const plaintext = 'Hello, World!';
      const e2eeSessionId = 'p_1_2';

      // Act
      await cache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        serverMessageId: serverMessageId,
      );

      final result = await cache.getPlaintextByServerId(serverMessageId);

      // Assert
      expect(result, equals(plaintext));
    });

    test('should update serverMessageId after server confirms', () async {
      // Arrange
      const clientMessageId = 'client_123';
      const initialServerId = '456';
      const updatedServerId = '789';
      const plaintext = 'Hello, World!';
      const e2eeSessionId = 'p_1_2';

      await cache.put(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        serverMessageId: initialServerId,
      );

      // Act
      await cache.updateServerId(
        clientMessageId: clientMessageId,
        serverMessageId: updatedServerId,
      );

      // Assert
      final resultByNewId = await cache.getPlaintextByServerId(updatedServerId);
      expect(resultByNewId, equals(plaintext));

      // Old server ID should still work (both entries exist)
      final resultByOldId = await cache.getPlaintextByServerId(initialServerId);
      expect(resultByOldId, equals(plaintext));
    });

    test('should return null for non-existent clientMessageId', () async {
      final result = await cache.getPlaintextByClientId('non_existent');
      expect(result, isNull);
    });

    test('should return null for non-existent serverMessageId', () async {
      final result = await cache.getPlaintextByServerId('non_existent');
      expect(result, isNull);
    });

    test('should clear all cached entries', () async {
      // Arrange
      await cache.put(
        clientMessageId: 'client_1',
        plaintext: 'Message 1',
        e2eeSessionId: 'p_1_2',
      );
      await cache.put(
        clientMessageId: 'client_2',
        plaintext: 'Message 2',
        e2eeSessionId: 'p_1_3',
      );

      // Act
      await cache.clearAll();

      // Assert
      final result1 = await cache.getPlaintextByClientId('client_1');
      final result2 = await cache.getPlaintextByClientId('client_2');
      expect(result1, isNull);
      expect(result2, isNull);
    });

    test('should clear entries for a specific session', () async {
      // Arrange
      await cache.put(
        clientMessageId: 'client_1',
        plaintext: 'Message 1',
        e2eeSessionId: 'p_1_2',
      );
      await cache.put(
        clientMessageId: 'client_2',
        plaintext: 'Message 2',
        e2eeSessionId: 'p_1_3',
      );

      // Act
      await cache.clearSession('p_1_2');

      // Assert
      final result1 = await cache.getPlaintextByClientId('client_1');
      final result2 = await cache.getPlaintextByClientId('client_2');
      expect(result1, isNull);
      expect(result2, equals('Message 2'));
    });

    test('should not store empty clientMessageId', () async {
      // Act
      await cache.put(
        clientMessageId: '',
        plaintext: 'Hello',
        e2eeSessionId: 'p_1_2',
      );

      // Assert
      final keys = await storage.getAllKeys();
      expect(keys, isEmpty);
    });

    test('should not store empty plaintext', () async {
      // Act
      await cache.put(
        clientMessageId: 'client_1',
        plaintext: '',
        e2eeSessionId: 'p_1_2',
      );

      // Assert
      final keys = await storage.getAllKeys();
      expect(keys, isEmpty);
    });
  });
}
