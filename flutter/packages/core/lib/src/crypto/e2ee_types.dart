/// E2EE session status enum
enum E2eeSessionStatus {
  plaintext,
  negotiating,
  encrypted,
  failed;

  static E2eeSessionStatus fromString(String value) {
    return switch (value) {
      'plaintext' => E2eeSessionStatus.plaintext,
      'negotiating' => E2eeSessionStatus.negotiating,
      'encrypted' => E2eeSessionStatus.encrypted,
      'failed' => E2eeSessionStatus.failed,
      _ => E2eeSessionStatus.plaintext,
    };
  }

  String get value => name;
}

/// E2EE negotiation action
enum E2eeNegotiationAction {
  request,
  accepted,
  rejected,
  disabled;

  static E2eeNegotiationAction fromString(String value) {
    return switch (value) {
      'request' => E2eeNegotiationAction.request,
      'accepted' => E2eeNegotiationAction.accepted,
      'rejected' => E2eeNegotiationAction.rejected,
      'disabled' => E2eeNegotiationAction.disabled,
      _ => E2eeNegotiationAction.request,
    };
  }
}

/// Parsed E2EE negotiation event from WebSocket
class E2eeNegotiationEvent {
  const E2eeNegotiationEvent({
    required this.sessionId,
    required this.action,
    required this.requesterId,
    this.requesterName,
    this.targetUserId,
    this.requestPayloadJson,
  });

  final String sessionId;
  final E2eeNegotiationAction action;
  final String requesterId;
  final String? requesterName;
  final String? targetUserId;
  final String? requestPayloadJson;
}
