import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:im_shared_features/chat.dart' show SentMessageCachePort;

/// Mobile implementation of [SentMessageCachePort] using SharedPreferences.
///
/// Caches plaintext of self-sent E2EE messages for history recovery since the
/// server only stores the encrypted envelope and cannot decrypt.
///
/// TTL: 24 hours, max entries: 500.
class MobileSentMessageCache implements SentMessageCachePort {
  MobileSentMessageCache(this._prefs);

  final SharedPreferences _prefs;

  static const _prefix = 'e2ee_sent_';
  static const _indexKey = 'e2ee_sent_index';
  static const _maxEntries = 500;
  static const _ttlMs = 24 * 60 * 60 * 1000; // 24 hours

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? serverMessageId,
  }) async {
    if (clientMessageId.isEmpty || plaintext.isEmpty) return;

    final entry = jsonEncode({
      'clientMessageId': clientMessageId,
      'plaintext': plaintext,
      'e2eeSessionId': e2eeSessionId,
      'serverMessageId': serverMessageId,
      'createdAtMs': DateTime.now().millisecondsSinceEpoch,
    });

    await _prefs.setString('$_prefix$clientMessageId', entry);

    // Update index for cleanup.
    final index = _getIndex();
    index.add(clientMessageId);
    if (serverMessageId != null && serverMessageId.isNotEmpty) {
      index.add('srv_$serverMessageId');
    }
    await _saveIndex(index);

    // Trim if over capacity.
    await _trimIfNeeded();
  }

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) async {
    if (clientMessageId.isEmpty) return null;
    final raw = _prefs.getString('$_prefix$clientMessageId');
    if (raw == null) return null;

    try {
      final entry = jsonDecode(raw) as Map<String, dynamic>;
      if (_isExpired(entry)) {
        await _prefs.remove('$_prefix$clientMessageId');
        return null;
      }
      return entry['plaintext'] as String?;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) async {
    if (serverMessageId.isEmpty || serverMessageId.startsWith('local_')) {
      return null;
    }

    // Try the dedicated server-ID key first.
    final raw = _prefs.getString('$_prefix$serverMessageId');
    if (raw != null) {
      try {
        final entry = jsonDecode(raw) as Map<String, dynamic>;
        if (!_isExpired(entry)) {
          return entry['plaintext'] as String?;
        }
      } catch (_) {}
    }

    // Fall back to scanning index.
    final index = _getIndex();
    for (final key in index.toList()) {
      if (key.startsWith('srv_')) continue;
      final rawEntry = _prefs.getString('$_prefix$key');
      if (rawEntry == null) continue;
      try {
        final entry = jsonDecode(rawEntry) as Map<String, dynamic>;
        if (entry['serverMessageId'] == serverMessageId) {
          if (_isExpired(entry)) {
            await _prefs.remove('$_prefix$key');
            continue;
          }
          return entry['plaintext'] as String?;
        }
      } catch (_) {}
    }

    return null;
  }

  @override
  Future<void> updateServerId(
      String clientMessageId, String serverMessageId) async {
    final raw = _prefs.getString('$_prefix$clientMessageId');
    if (raw == null) return;

    try {
      final entry = jsonDecode(raw) as Map<String, dynamic>;
      entry['serverMessageId'] = serverMessageId;
      await _prefs.setString(
          '$_prefix$clientMessageId', jsonEncode(entry));
    } catch (_) {}
  }

  @override
  Future<void> clearAll() async {
    final index = _getIndex();
    for (final key in index) {
      await _prefs.remove('$_prefix$key');
    }
    await _prefs.remove(_indexKey);
  }

  @override
  Future<void> clearSession(String e2eeSessionId) async {
    final index = _getIndex();
    final toRemove = <String>[];

    for (final key in index) {
      if (key.startsWith('srv_')) continue;
      final raw = _prefs.getString('$_prefix$key');
      if (raw == null) continue;
      try {
        final entry = jsonDecode(raw) as Map<String, dynamic>;
        if (entry['e2eeSessionId'] == e2eeSessionId) {
          toRemove.add(key);
        }
      } catch (_) {}
    }

    for (final key in toRemove) {
      await _prefs.remove('$_prefix$key');
      index.remove(key);
    }
    await _saveIndex(index);
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
    return (DateTime.now().millisecondsSinceEpoch - createdAtMs) > _ttlMs;
  }

  Future<void> _trimIfNeeded() async {
    final index = _getIndex();
    final userKeys = index.where((k) => !k.startsWith('srv_')).toList();
    if (userKeys.length <= _maxEntries) return;

    // Sort by creation time (oldest first) and remove excess.
    final entries = <Map<String, dynamic>>[];
    for (final key in userKeys) {
      final raw = _prefs.getString('$_prefix$key');
      if (raw == null) continue;
      try {
        final entry = jsonDecode(raw) as Map<String, dynamic>;
        entries.add(entry);
      } catch (_) {}
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
      await _prefs.remove('$_prefix$id');
      index.remove(id);
    }
    await _saveIndex(index);
  }
}
