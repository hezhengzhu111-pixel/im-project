/// Abstract interface for E2EE ratchet session state storage.
///
/// Platform-specific implementations (IndexedDB on web, SharedPreferences on
/// desktop) must conform to this contract.
///
/// The [stateBase64] value stored and returned by implementations is expected
/// to be a context-bound session envelope produced by the E2EE bridge's
/// exportSessionEnvelope method. Callers (typically [E2eeManager]) are
/// responsible for wrapping and unwrapping the raw ratchet state via the
/// bridge; the store persists the opaque envelope.
abstract class E2eeSessionStore {
  Future<void> init();

  Future<void> saveSession({
    required String sessionId,
    required String stateBase64,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
    String direction = 'outbound',
  });

  Future<String?> getSession({
    required String sessionId,
    required String localDeviceId,
    required String remoteUserId,
    required String remoteDeviceId,
  });

  Future<SessionLookupResult?> findSessionByLocalDevice({
    required String sessionId,
    required String localDeviceId,
  });

  Future<void> deleteSession(String sessionId);
  Future<void> clearAll();

  void dispose();
}

class SessionLookupResult {
  final String stateBase64;
  final String remoteDeviceId;

  SessionLookupResult({
    required this.stateBase64,
    required this.remoteDeviceId,
  });
}
