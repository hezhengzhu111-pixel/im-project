/// Abstract interface for sent message cache (platform-specific storage).
abstract class SentMessageCachePort {
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? serverMessageId,
  });
  Future<String?> getPlaintextByClientId(String clientMessageId);
  Future<String?> getPlaintextByServerId(String serverMessageId);
  Future<void> updateServerId(String clientMessageId, String serverMessageId);
  Future<void> clearAll();
  Future<void> clearSession(String e2eeSessionId);
}
