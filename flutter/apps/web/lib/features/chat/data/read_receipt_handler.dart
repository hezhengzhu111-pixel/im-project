import 'package:im_core/core.dart';

/// Pure logic for computing read receipt updates.
///
/// This module extracts the "which messages should be marked READ" computation
/// from [ChatNotifierWithOutbox._handleReadReceipt] into testable, stateless
/// functions. No Riverpod, no StateNotifier, no side effects.
class ReadReceiptHandler {
  const ReadReceiptHandler._();

  /// Computes which message IDs should be marked as READ based on the
  /// incoming read receipt event data.
  ///
  /// Returns a set of message IDs that should have their status updated to
  /// 'READ'. Returns empty if no update is needed.
  ///
  /// Rules:
  /// - [readerId] must be present and non-empty.
  /// - [readerId] must not equal [currentUserId] (skip self-read receipts).
  /// - Only messages sent by [currentUserId] are updated (not the other user's).
  /// - [messageId] updates a single message.
  /// - [messageIds] updates multiple specific messages.
  /// - [lastReadMessageId] updates all own messages up to and including the target.
  static Set<String> computeReadReceiptTargetIds({
    required List<Message> sessionMessages,
    required Map<String, dynamic> eventData,
    required String currentUserId,
  }) {
    // Validate reader identity.
    final readerId =
        eventData['readerId']?.toString() ?? eventData['userId']?.toString();
    if (readerId == null || readerId.isEmpty) return {};
    if (currentUserId.isEmpty) return {};
    if (readerId == currentUserId) return {};

    // Extract message identifiers from event.
    final messageId = eventData['messageId']?.toString();
    final messageIds = eventData['messageIds'];
    final lastReadMessageId = eventData['lastReadMessageId']?.toString();

    // If no specific message identifiers, don't mark anything as READ.
    if (messageId == null && messageIds == null && lastReadMessageId == null) {
      return {};
    }

    // Determine which message IDs should be marked as READ.
    final targetIds = <String>{};

    if (messageId != null) {
      targetIds.add(messageId);
    }

    if (messageIds is List) {
      for (final id in messageIds) {
        targetIds.add(id.toString());
      }
    }

    if (lastReadMessageId != null) {
      // lastReadMessageId: mark all messages up to and including this one
      // that were sent by the current user.
      final lastReadIndex = sessionMessages.indexWhere(
        (m) =>
            m.id == lastReadMessageId ||
            m.clientMessageId == lastReadMessageId,
      );
      if (lastReadIndex != -1) {
        for (var i = 0; i <= lastReadIndex; i++) {
          final msg = sessionMessages[i];
          if (msg.senderId == currentUserId) {
            targetIds.add(msg.id);
          }
        }
      }
    }

    // Filter: only mark own messages as READ.
    return targetIds.where((id) {
      final msg = sessionMessages.firstWhere(
        (m) => m.id == id || m.clientMessageId == id,
        orElse: () => const Message(
          id: '',
          senderId: '',
          isGroupChat: false,
          messageType: '',
          content: '',
          sendTime: '',
          status: '',
        ),
      );
      return msg.senderId == currentUserId && msg.status != 'READ';
    }).toSet();
  }

  /// Applies read receipt updates to a list of messages.
  ///
  /// Returns a new list with the specified messages' status updated to 'READ'.
  /// Messages not in [targetIds] or not sent by the current user are unchanged.
  static List<Message> applyReadReceipts({
    required List<Message> messages,
    required Set<String> targetIds,
    required String currentUserId,
  }) {
    if (targetIds.isEmpty) return messages;

    return messages.map((m) {
      if (targetIds.contains(m.id) || targetIds.contains(m.clientMessageId)) {
        // Only mark our own messages as READ.
        if (m.senderId == currentUserId && m.status != 'READ') {
          return m.copyWith(status: 'READ');
        }
      }
      return m;
    }).toList();
  }
}
