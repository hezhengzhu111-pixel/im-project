import 'package:im_shared_features/chat.dart';

import '../../e2ee/data/e2ee_sent_message_cache.dart';

class WebSentMessageCacheAdapter implements SentMessageCachePort {
  WebSentMessageCacheAdapter(this._cache);

  final E2eeSentMessageCache _cache;

  @override
  Future<void> clearAll() => _cache.clearAll();

  @override
  Future<void> clearSession(String e2eeSessionId) =>
      _cache.clearSession(e2eeSessionId);

  @override
  Future<String?> getPlaintextByClientId(String clientMessageId) =>
      _cache.getPlaintextByClientId(clientMessageId);

  @override
  Future<String?> getPlaintextByServerId(String serverMessageId) =>
      _cache.getPlaintextByServerId(serverMessageId);

  @override
  Future<void> put({
    required String clientMessageId,
    required String plaintext,
    required String e2eeSessionId,
    String? serverMessageId,
  }) {
    return _cache.put(
      clientMessageId: clientMessageId,
      plaintext: plaintext,
      e2eeSessionId: e2eeSessionId,
      serverMessageId: serverMessageId,
    );
  }

  @override
  Future<void> updateServerId(String clientMessageId, String serverMessageId) {
    return _cache.updateServerId(
      clientMessageId: clientMessageId,
      serverMessageId: serverMessageId,
    );
  }
}
