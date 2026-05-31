/// Abstract interface for E2EE ratchet session state storage.
///
/// Platform-specific implementations (IndexedDB on web, SharedPreferences on
/// desktop) must conform to this contract.
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
