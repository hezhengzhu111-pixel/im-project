import 'package:im_web/core/logging/app_logger.dart';

/// Cache for storing plaintext of E2EE messages sent by the current user.
///
/// This cache is used to recover message content when loading history,
/// since the server only stores the encrypted envelope and cannot decrypt
/// messages sent by the current user.
class E2eeSentMessageCache {
  E2eeSentMessageCache({required this.storage});

  /// Storage interface for persisting cache data.
  final SentMessageCacheStorage storage;

  /// TTL for cached entries (24 hours).
  static const _ttlMs = 24 * 60 * 60 * 1000;

  /// Maximum number of cached entries.
  static const _maxEntries = 500;

  // ---------------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------------

  /// Store a plaintext message by clientMessageId.
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? peerUserId,
    String? serverMessageId,
  }) async {
    if (clientMessageId.isEmpty || plaintext.isEmpty) return;

    try {
      final entry = _CacheEntry(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        peerUserId: peerUserId,
        serverMessageId: serverMessageId,
        createdAtMs: DateTime.now().millisecondsSinceEpoch,
      );

      final key = _keyForClientMessageId(clientMessageId);
      await storage.write(key, entry.toJson());

      // Also store reverse lookup by serverMessageId if provided.
      if (serverMessageId != null && serverMessageId.isNotEmpty) {
        final serverKey = _keyForServerMessageId(serverMessageId);
        await storage.write(serverKey, entry.toJson());
      }

      // Enforce TTL and capacity limits.
      await _evictExpired();
      await _enforceCapacity();
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to cache sent E2EE message', e, st, 'e2ee');
    }
  }

  /// Update an existing entry with serverMessageId after server confirms.
  Future<void> updateServerId({
    required String clientMessageId,
    required String serverMessageId,
  }) async {
    if (clientMessageId.isEmpty || serverMessageId.isEmpty) return;

    try {
      final key = _keyForClientMessageId(clientMessageId);
      final existing = await storage.read(key);
      if (existing == null) return;

      final entry = _CacheEntry.fromJson(existing);
      final updated = entry.copyWith(serverMessageId: serverMessageId);

      await storage.write(key, updated.toJson());

      // Also store reverse lookup.
      final serverKey = _keyForServerMessageId(serverMessageId);
      await storage.write(serverKey, updated.toJson());
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to update sent E2EE message server ID', e, st, 'e2ee');
    }
  }

  // ---------------------------------------------------------------------------
  // Retrieve
  // ---------------------------------------------------------------------------

  /// Get plaintext by clientMessageId.
  Future<String?> getPlaintextByClientId(String clientMessageId) async {
    if (clientMessageId.isEmpty) return null;

    try {
      final key = _keyForClientMessageId(clientMessageId);
      final data = await storage.read(key);
      if (data == null) return null;

      final entry = _CacheEntry.fromJson(data);
      if (_isExpired(entry)) {
        await storage.delete(key);
        return null;
      }

      return entry.plaintext;
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to retrieve sent E2EE message', e, st, 'e2ee');
      return null;
    }
  }

  /// Get plaintext by serverMessageId.
  Future<String?> getPlaintextByServerId(String serverMessageId) async {
    if (serverMessageId.isEmpty) return null;

    try {
      final key = _keyForServerMessageId(serverMessageId);
      final data = await storage.read(key);
      if (data == null) return null;

      final entry = _CacheEntry.fromJson(data);
      if (_isExpired(entry)) {
        await storage.delete(key);
        return null;
      }

      return entry.plaintext;
    } catch (e, st) {
      AppLogger.instance.error(
          'Failed to retrieve sent E2EE message by server ID', e, st, 'e2ee');
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /// Clear all cached entries for the current user.
  Future<void> clearAll() async {
    try {
      await storage.clearAll();
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to clear sent E2EE message cache', e, st, 'e2ee');
    }
  }

  /// Clear cached entries for a specific E2EE session.
  Future<void> clearSession(String e2eeSessionId) async {
    try {
      await storage.deleteBySession(e2eeSessionId);
    } catch (e, st) {
      AppLogger.instance.error(
          'Failed to clear sent E2EE message cache for session', e, st, 'e2ee');
    }
  }

  /// Clear expired entries.
  Future<void> clearExpired() async {
    try {
      await _evictExpired();
    } catch (e, st) {
      AppLogger.instance
          .error('Failed to clear expired sent E2EE messages', e, st, 'e2ee');
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  String _keyForClientMessageId(String clientMessageId) =>
      'e2ee_sent_$clientMessageId';

  String _keyForServerMessageId(String serverMessageId) =>
      'e2ee_sent_srv_$serverMessageId';

  bool _isExpired(_CacheEntry entry) {
    final now = DateTime.now().millisecondsSinceEpoch;
    return (now - entry.createdAtMs) > _ttlMs;
  }

  Future<void> _evictExpired() async {
    final allKeys = await storage.getAllKeys();
    final sentKeys = allKeys.where((k) => k.startsWith('e2ee_sent_')).toList();

    for (final key in sentKeys) {
      final data = await storage.read(key);
      if (data == null) continue;

      final entry = _CacheEntry.fromJson(data);
      if (_isExpired(entry)) {
        await storage.delete(key);
      }
    }
  }

  Future<void> _enforceCapacity() async {
    final allKeys = await storage.getAllKeys();
    final sentKeys = allKeys.where((k) => k.startsWith('e2ee_sent_')).toList();

    if (sentKeys.length <= _maxEntries) return;

    // Read all entries and sort by creation time.
    final entries = <(String, _CacheEntry)>[];
    for (final key in sentKeys) {
      final data = await storage.read(key);
      if (data != null) {
        entries.add((key, _CacheEntry.fromJson(data)));
      }
    }

    entries.sort((a, b) => a.$2.createdAtMs.compareTo(b.$2.createdAtMs));

    // Delete oldest entries to stay within capacity.
    final toDelete = entries.take(entries.length - _maxEntries);
    for (final (key, _) in toDelete) {
      await storage.delete(key);
    }
  }
}

/// A single cached entry.
class _CacheEntry {
  _CacheEntry({
    required this.clientMessageId,
    required this.plaintext,
    required this.e2eeSessionId,
    this.peerUserId,
    this.serverMessageId,
    required this.createdAtMs,
  });

  final String clientMessageId;
  final String plaintext;
  final String e2eeSessionId;
  final String? peerUserId;
  final String? serverMessageId;
  final int createdAtMs;

  Map<String, dynamic> toJson() => {
        'clientMessageId': clientMessageId,
        'plaintext': plaintext,
        'e2eeSessionId': e2eeSessionId,
        if (peerUserId != null) 'peerUserId': peerUserId,
        if (serverMessageId != null) 'serverMessageId': serverMessageId,
        'createdAtMs': createdAtMs,
      };

  factory _CacheEntry.fromJson(Map<String, dynamic> json) => _CacheEntry(
        clientMessageId: json['clientMessageId'] as String? ?? '',
        plaintext: json['plaintext'] as String? ?? '',
        e2eeSessionId: json['e2eeSessionId'] as String? ?? '',
        peerUserId: json['peerUserId'] as String?,
        serverMessageId: json['serverMessageId'] as String?,
        createdAtMs: json['createdAtMs'] as int? ?? 0,
      );

  _CacheEntry copyWith({String? serverMessageId}) => _CacheEntry(
        clientMessageId: clientMessageId,
        plaintext: plaintext,
        e2eeSessionId: e2eeSessionId,
        peerUserId: peerUserId,
        serverMessageId: serverMessageId ?? this.serverMessageId,
        createdAtMs: createdAtMs,
      );
}

/// Storage interface for sent message cache.
abstract class SentMessageCacheStorage {
  Future<void> write(String key, Map<String, dynamic> value);
  Future<Map<String, dynamic>?> read(String key);
  Future<void> delete(String key);
  Future<void> clearAll();
  Future<void> deleteBySession(String e2eeSessionId);
  Future<List<String>> getAllKeys();
}
