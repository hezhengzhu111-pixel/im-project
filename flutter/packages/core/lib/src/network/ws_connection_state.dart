enum WsConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,

  /// Permanent failure after exhausting the reconnection budget.
  /// The UI can observe this state and prompt the user to reload or retry.
  failed,
}
