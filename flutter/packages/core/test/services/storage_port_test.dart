import 'package:test/test.dart';
import 'package:im_core/core.dart';

/// In-memory implementation for verifying [StoragePort] and [SecureStoragePort] contracts.
class _FakeStoragePort implements StoragePort {
  final _data = <String, String>{};

  @override
  Future<String?> getString(String key) async => _data[key];

  @override
  Future<void> setString(String key, String value) async => _data[key] = value;

  @override
  Future<void> remove(String key) async => _data.remove(key);

  @override
  Future<void> clear() async => _data.clear();

  @override
  Future<bool> containsKey(String key) async => _data.containsKey(key);
}

class _FakeSecureStoragePort implements SecureStoragePort {
  final _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async => _data[key] = value;

  @override
  Future<void> delete(String key) async => _data.remove(key);

  @override
  Future<void> deleteAll() async => _data.clear();

  @override
  Future<bool> containsKey(String key) async => _data.containsKey(key);
}

void main() {
  group('StoragePort contract', () {
    late _FakeStoragePort storage;

    setUp(() => storage = _FakeStoragePort());

    test('setString stores value and getString retrieves it', () async {
      await storage.setString('key1', 'value1');
      expect(await storage.getString('key1'), 'value1');
    });

    test('containsKey returns true only for existing keys', () async {
      expect(await storage.containsKey('missing'), isFalse);
      await storage.setString('present', 'value');
      expect(await storage.containsKey('present'), isTrue);
    });

    test('remove deletes a single key', () async {
      await storage.setString('a', '1');
      await storage.setString('b', '2');
      await storage.remove('a');
      expect(await storage.getString('a'), isNull);
      expect(await storage.getString('b'), '2');
    });

    test('clear removes all values', () async {
      await storage.setString('a', '1');
      await storage.setString('b', '2');
      await storage.clear();
      expect(await storage.getString('a'), isNull);
      expect(await storage.getString('b'), isNull);
      expect(await storage.containsKey('a'), isFalse);
    });
  });

  group('SecureStoragePort contract', () {
    late _FakeSecureStoragePort storage;

    setUp(() => storage = _FakeSecureStoragePort());

    test('write stores value and read retrieves it', () async {
      await storage.write('secret', 'token');
      expect(await storage.read('secret'), 'token');
    });

    test('delete removes a single key', () async {
      await storage.write('secret', 'token');
      await storage.delete('secret');
      expect(await storage.read('secret'), isNull);
    });

    test('deleteAll removes all values', () async {
      await storage.write('a', '1');
      await storage.write('b', '2');
      await storage.deleteAll();
      expect(await storage.read('a'), isNull);
      expect(await storage.read('b'), isNull);
    });

    test('containsKey reflects stored keys', () async {
      expect(await storage.containsKey('missing'), isFalse);
      await storage.write('present', 'value');
      expect(await storage.containsKey('present'), isTrue);
    });
  });
}
