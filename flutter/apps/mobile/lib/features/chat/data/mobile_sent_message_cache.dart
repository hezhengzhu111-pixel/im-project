import 'dart:convert';
import 'package:im_core/core.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:im_shared_features/chat.dart' show SentMessageCachePort;

/// Mobile implementation of [SentMessageCachePort] using secure storage.
///
/// Caches plaintext of self-sent E2EE messages for history recovery since the
/// server only stores the encrypted envelope and cannot decrypt.
///
/// SharedPreferences is used only for non-sensitive index metadata. Plaintext
/// entries are stored behind [SecureStoragePort].
///
/// TTL: 24 hours, max entries: 500.
class MobileSentMessageCache implements SentMessageCachePort {
  MobileSentMessageCache(
    this._prefs,
    this._secureStorage, {
    DateTime Function()? now,
    int maxEntries = _defaultMaxEntries,
    int ttlMs = _defaultTtlMs,
  })  : _now = now ?? DateTime.now,
        _maxEntries = maxEntries,
        _ttlMs = ttlMs;

  final SharedPreferences _prefs;
  final SecureStoragePort _secureStorage;
  final DateTime Function() _now;
  final int _maxEntries;
  final int _ttlMs;

  static const _prefix = 'e2ee_sent_';
  static const _indexKey = 'e2ee_sent_index';
  static const _metaPrefix = 'e2ee_sent_meta_';
  static const _securePrefix = 'e2ee_secure_sent_';
  static const _defaultMaxEntries = 500;
  static const _defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  bool _migrationAttempted = false;

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? serverMessageId,
  }) async {
    if (clientMessageId.isEmpty || plaintext.isEmpty) return;
    await _migrateLegacyIfNeeded();

    final secureKey = _secureKey(clientMessageId);
    final createdAtMs = _now().millisecondsSinceEpoch;
    final metadata = jsonEncode({
      'clientMessageId': clientMessageId,
      'e2eeSessionId': e2eeSessionId,
      'serverMessageId': serverMessageId,
      'createdAtMs': createdAtMs,
      'secureKey': secureKey,
    });
    final payload = jsonEncode({
      'plaintext': plaintext,
      'createdAtMs': createdAtMs,
    });

    await _secureStorage.write(secureKey, payload);
    await _prefs.setString('$_metaPrefix$clientMessageId', metadata);
    await _prefs.remove('$_prefix$clientMessageId');

    final index = _getIndex();
    index.add(clientMessageId);
    await _saveIndex(index);
    await _cleanupExpired();
    await _trimIfNeeded();
  }

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) async {
    if (clientMessageId.isEmpty) return null;
    await _migrateLegacyIfNeeded();

    final metadata = _getMetadata(clientMessageId);
    if (metadata == null) return null;
    if (_isExpired(metadata)) {
      await _removeEntry(clientMessageId);
      return null;
    }
    return _readPlaintext(metadata);
  }

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) async {
    if (serverMessageId.isEmpty || serverMessageId.startsWith('local_')) {
      return null;
    }
    await _migrateLegacyIfNeeded();

    final index = _getIndex();
    for (final key in index.toList()) {
      if (key.startsWith('srv_')) continue;
      final metadata = _getMetadata(key);
      if (metadata == null) continue;
      if (metadata['serverMessageId'] == serverMessageId) {
        if (_isExpired(metadata)) {
          await _removeEntry(key);
          continue;
        }
        return _readPlaintext(metadata);
      }
    }

    return null;
  }

  @override
  Future<void> updateServerId(
      String clientMessageId, String serverMessageId) async {
    if (clientMessageId.isEmpty || serverMessageId.isEmpty) return;
    await _migrateLegacyIfNeeded();

    final metadata = _getMetadata(clientMessageId);
    if (metadata == null) return;
    metadata['serverMessageId'] = serverMessageId;
    await _prefs.setString(
        '$_metaPrefix$clientMessageId', jsonEncode(metadata));
  }

  @override
  Future<void> clearAll() async {
    final index = _getIndex();
    for (final key in index) {
      if (!key.startsWith('srv_')) {
        await _secureStorage.delete(_secureKey(key));
      }
      await _prefs.remove('$_metaPrefix$key');
      await _prefs.remove('$_prefix$key');
    }
    for (final key in _prefs.getKeys()) {
      if (key.startsWith(_prefix) || key.startsWith(_metaPrefix)) {
        if (key.startsWith(_metaPrefix)) {
          final raw = _prefs.getString(key);
          try {
            final decoded = raw == null ? null : jsonDecode(raw);
            if (decoded is Map<String, dynamic>) {
              final secureKey = decoded['secureKey'] as String?;
              if (secureKey != null && secureKey.isNotEmpty) {
                await _secureStorage.delete(secureKey);
              }
            }
          } catch (_) {}
        }
        await _prefs.remove(key);
      }
    }
    await _prefs.remove(_indexKey);
  }

  @override
  Future<void> clearSession(String e2eeSessionId) async {
    await _migrateLegacyIfNeeded();
    final index = _getIndex();
    final toRemove = <String>[];

    for (final key in index) {
      if (key.startsWith('srv_')) continue;
      final metadata = _getMetadata(key);
      if (metadata == null) continue;
      if (metadata['e2eeSessionId'] == e2eeSessionId) {
        toRemove.add(key);
      }
    }

    for (final key in toRemove) {
      await _removeEntry(key);
    }
  }

  // ---- Internal helpers ----

  Set<String> _getIndex() {
    final raw = _prefs.getString(_indexKey);
    if (raw == null) return {};
    try {
      return Set<String>.from(jsonDecode(raw) as List);
    } catch (_) {
      return {};
    }
  }

  Future<void> _saveIndex(Set<String> index) async {
    await _prefs.setString(_indexKey, jsonEncode(index.toList()));
  }

  bool _isExpired(Map<String, dynamic> entry) {
    final createdAtMs = entry['createdAtMs'] as int?;
    if (createdAtMs == null) return true;
    return (_now().millisecondsSinceEpoch - createdAtMs) > _ttlMs;
  }

  String _secureKey(String clientMessageId) => '$_securePrefix$clientMessageId';

  Map<String, dynamic>? _getMetadata(String clientMessageId) {
    final raw = _prefs.getString('$_metaPrefix$clientMessageId');
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<String?> _readPlaintext(Map<String, dynamic> metadata) async {
    final secureKey = metadata['secureKey'] as String?;
    if (secureKey == null || secureKey.isEmpty) return null;
    final raw = await _secureStorage.read(secureKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return decoded['plaintext'] as String?;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Future<void> _removeEntry(String clientMessageId) async {
    await _secureStorage.delete(_secureKey(clientMessageId));
    await _prefs.remove('$_metaPrefix$clientMessageId');
    await _prefs.remove('$_prefix$clientMessageId');
    final index = _getIndex()..remove(clientMessageId);
    await _saveIndex(index);
  }

  Future<void> _cleanupExpired() async {
    final index = _getIndex();
    for (final key in index.toList()) {
      if (key.startsWith('srv_')) {
        index.remove(key);
        continue;
      }
      final metadata = _getMetadata(key);
      if (metadata == null || _isExpired(metadata)) {
        await _removeEntry(key);
      }
    }
  }

  Future<void> _trimIfNeeded() async {
    final index = _getIndex();
    final userKeys = index.where((k) => !k.startsWith('srv_')).toList();
    if (userKeys.length <= _maxEntries) return;

    final entries = <Map<String, dynamic>>[];
    for (final key in userKeys) {
      final metadata = _getMetadata(key);
      if (metadata != null) entries.add(metadata);
    }
    entries.sort((a, b) {
      final aTime = a['createdAtMs'] as int? ?? 0;
      final bTime = b['createdAtMs'] as int? ?? 0;
      return aTime.compareTo(bTime);
    });

    final toRemove = entries
        .take(entries.length - _maxEntries)
        .map((e) => e['clientMessageId'] as String? ?? '')
        .where((id) => id.isNotEmpty)
        .toList();

    for (final id in toRemove) {
      await _removeEntry(id);
    }
  }

  Future<void> _migrateLegacyIfNeeded() async {
    if (_migrationAttempted) return;
    _migrationAttempted = true;

    final index = _getIndex();
    final migratedIndex = <String>{
      for (final key in index)
        if (!key.startsWith('srv_')) key,
    };

    for (final key in index.toList()) {
      if (key.startsWith('srv_')) continue;

      final legacyKey = '$_prefix$key';
      final raw = _prefs.getString(legacyKey);
      if (raw == null) continue;

      try {
        final decoded = jsonDecode(raw);
        if (decoded is! Map<String, dynamic>) {
          await _prefs.remove(legacyKey);
          migratedIndex.remove(key);
          continue;
        }
        final plaintext = decoded['plaintext'] as String?;
        if (plaintext == null || plaintext.isEmpty || _isExpired(decoded)) {
          await _prefs.remove(legacyKey);
          migratedIndex.remove(key);
          continue;
        }

        final secureKey = _secureKey(key);
        final createdAtMs = decoded['createdAtMs'] as int?;
        final metadata = jsonEncode({
          'clientMessageId': decoded['clientMessageId'] as String? ?? key,
          'e2eeSessionId': decoded['e2eeSessionId'] as String? ?? '',
          'serverMessageId': decoded['serverMessageId'] as String?,
          'createdAtMs': createdAtMs ?? _now().millisecondsSinceEpoch,
          'secureKey': secureKey,
        });
        final payload = jsonEncode({
          'plaintext': plaintext,
          'createdAtMs': createdAtMs ?? _now().millisecondsSinceEpoch,
        });

        await _secureStorage.write(secureKey, payload);
        await _prefs.setString('$_metaPrefix$key', metadata);
        await _prefs.remove(legacyKey);
        migratedIndex.add(key);
      } catch (_) {
        await _prefs.remove(legacyKey);
        migratedIndex.remove(key);
      }
    }

    await _saveIndex(migratedIndex);
    await _cleanupExpired();
    await _trimIfNeeded();
  }
}
