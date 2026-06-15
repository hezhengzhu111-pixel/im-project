import 'package:im_core/core.dart';

/// Result of E2EE history recovery for a single message.
class E2eeRecoveryResult {
  const E2eeRecoveryResult({
    required this.content,
    required this.decryptStatus,
    this.shouldWriteCache = false,
  });

  /// The decrypted or recovered plaintext content.
  final String content;

  /// The decrypt status to set on the message.
  final String decryptStatus;

  /// Whether the result should be written to the sent message cache.
  /// This is true when an encrypted own message is successfully decrypted,
  /// so future recovery attempts can use the cache.
  final bool shouldWriteCache;
}

/// Pure logic for E2EE history message recovery.
///
/// This module extracts the "how to decrypt or restore an encrypted message"
/// logic from [ChatNotifierWithOutbox._decryptLoadedMessage] and
/// [ChatNotifierWithOutbox._decryptOwnSentMessage] into testable functions.
///
/// No Riverpod, no StateNotifier, no direct state mutation.
class E2eeHistoryRecovery {
  const E2eeHistoryRecovery._();

  /// Determines whether a message needs E2EE recovery.
  ///
  /// Returns true if the message is encrypted and has an envelope.
  static bool needsRecovery(Message message) {
    return message.encrypted == true && message.e2eeEnvelope != null;
  }

  /// Computes the recovery result for a message from another user.
  ///
  /// This handles the case where [message.senderId] != [currentUserId].
  /// The message should be decrypted via the E2EE manager. If decryption
  /// fails, the content is empty and status is 'failed'.
  ///
  /// Does NOT use the sent message cache (only own messages use cache).
  static E2eeRecoveryResult computeOtherMessageRecovery({
    required bool decryptSuccess,
    required String decryptedContent,
  }) {
    if (decryptSuccess) {
      return E2eeRecoveryResult(
        content: decryptedContent,
        decryptStatus: 'success',
      );
    }
    return const E2eeRecoveryResult(
      content: '',
      decryptStatus: 'failed',
    );
  }

  /// Computes the recovery result for a message sent by the current user.
  ///
  /// Recovery priority:
  /// 1. Try E2EE decrypt (works if session state is still valid).
  ///    - On success, write to cache for future recovery.
  /// 2. Fall back to local sent message cache.
  ///    - On cache hit, return 'restored_from_local_cache'.
  /// 3. Return 'unavailable_own_history' if both fail.
  static E2eeRecoveryResult computeOwnMessageRecovery({
    required bool decryptSuccess,
    required String decryptedContent,
    required bool cacheHit,
    required String cachedPlaintext,
  }) {
    // Step 1: Try E2EE decrypt.
    if (decryptSuccess) {
      return E2eeRecoveryResult(
        content: decryptedContent,
        decryptStatus: 'success',
        shouldWriteCache: true,
      );
    }

    // Step 2: Try local sent message cache.
    if (cacheHit && cachedPlaintext.isNotEmpty) {
      return E2eeRecoveryResult(
        content: cachedPlaintext,
        decryptStatus: 'restored_from_local_cache',
      );
    }

    // Step 3: Both failed.
    return const E2eeRecoveryResult(
      content: '',
      decryptStatus: 'unavailable_own_history',
    );
  }

  /// Converts a camelCase E2EE envelope to snake_case format
  /// expected by the E2EE manager's decrypt API.
  static Map<String, dynamic> camelToSnakeEnvelope(Map<String, dynamic> camel) {
    return {
      'version': camel['version'],
      'algorithm': camel['algorithm'],
      'sender_device_id': camel['senderDeviceId'],
      'recipient_device_id': camel['recipientDeviceId'],
      'session_id': camel['sessionId'],
      'wire': camel['wire'],
      if (camel['handshake'] != null) 'handshake': camel['handshake'],
    };
  }

  /// Extracts the E2EE session ID from a message's envelope.
  ///
  /// Returns the sessionId from the envelope, or empty string if not available.
  static String extractSessionId(Message message) {
    return message.e2eeEnvelope?.sessionId ?? '';
  }

  /// Checks if a message is from the current user.
  static bool isOwnMessage(Message message, String currentUserId) {
    return message.senderId == currentUserId;
  }
}
