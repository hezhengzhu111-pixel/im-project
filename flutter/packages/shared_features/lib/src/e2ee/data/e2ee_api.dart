import 'package:im_core/core.dart';

/// HTTP API client for E2EE key management and negotiation.
class E2eeApi {
  E2eeApi(this._httpClient);

  final HttpClientPort _httpClient;

  /// Upload public key bundle to server.
  Future<void> uploadBundle(Map<String, dynamic> bundleData) async {
    await _httpClient.post<void>(
      E2eeEndpoints.bundle,
      body: bundleData,
      fromJson: (_) {},
    );
  }

  /// Get remote user's pre-key bundle.
  Future<Map<String, dynamic>> getBundle(
    String userId, {
    required String deviceId,
    required String conversationId,
    required String requesterDeviceId,
  }) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.bundle,
      queryParameters: {
        'userId': userId,
        'deviceId': deviceId,
        'conversationId': conversationId,
        'requesterDeviceId': requesterDeviceId,
      },
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Get E2EE devices for a user.
  Future<List<Map<String, dynamic>>> getDevices(String userId) async {
    final response = await _httpClient.get<List<Map<String, dynamic>>>(
      E2eeEndpoints.devices,
      queryParameters: {'userId': userId},
      fromJson: (json) => ((json['items'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => item.map((key, value) => MapEntry('$key', value)))
          .toList(),
    );
    return response.data;
  }

  /// Send E2EE negotiation request.
  Future<void> requestEncryption({
    required String sessionId,
    required String identityKey,
    required String signedPreKey,
    required String requestPayloadJson,
  }) async {
    await _httpClient.post<void>(
      E2eeEndpoints.request,
      body: {
        'sessionId': sessionId,
        'identityKey': identityKey,
        'signedPreKey': signedPreKey,
        'requestPayloadJson': requestPayloadJson,
      },
      fromJson: (_) {},
    );
  }

  /// Accept E2EE negotiation.
  Future<void> acceptEncryption({
    required String sessionId,
    required String signedPreKey,
  }) async {
    await _httpClient.post<void>(
      E2eeEndpoints.accept,
      body: {
        'sessionId': sessionId,
        'signedPreKey': signedPreKey,
      },
      fromJson: (_) {},
    );
  }

  /// Reject E2EE negotiation.
  Future<void> rejectEncryption(String sessionId) async {
    await _httpClient.post<void>(
      E2eeEndpoints.reject,
      body: {
        'sessionId': sessionId,
      },
      fromJson: (_) {},
    );
  }

  /// Disable encryption for a session.
  Future<void> disableEncryption(String sessionId) async {
    await _httpClient.post<void>(
      E2eeEndpoints.disable,
      body: {
        'sessionId': sessionId,
      },
      fromJson: (_) {},
    );
  }

  /// Get pending E2EE negotiation requests for the current user.
  Future<List<E2eeNegotiationEvent>> getPendingNegotiations() async {
    final response = await _httpClient.get<List<E2eeNegotiationEvent>>(
      E2eeEndpoints.pending,
      fromJson: (json) => ((json['items'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (item) => E2eeNegotiationEvent(
              sessionId: item['sessionId']?.toString() ?? '',
              action: E2eeNegotiationAction.request,
              requesterId: item['requesterId']?.toString() ?? '',
              requesterName: item['requesterName']?.toString(),
              targetUserId: item['targetUserId']?.toString(),
              requestPayloadJson: item['requestPayloadJson']?.toString(),
            ),
          )
          .where((event) => event.sessionId.isNotEmpty)
          .toList(),
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getSessionStatus(String sessionId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.status(sessionId),
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Send device heartbeat for key maintenance.
  Future<void> heartbeat() async {
    await _httpClient.post<void>(
      E2eeEndpoints.heartbeat,
      body: const {},
      fromJson: (_) {},
    );
  }

  Future<void> heartbeatDevice(String deviceId) async {
    await _httpClient.post<void>(
      E2eeEndpoints.heartbeat,
      body: {'deviceId': deviceId},
      fromJson: (_) {},
    );
  }

  /// Get remaining OTK (One-Time Key) count.
  Future<Map<String, dynamic>> getOpkStatus(String deviceId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.opkStatus,
      queryParameters: {'deviceId': deviceId},
      fromJson: (json) => json,
    );
    return response.data;
  }

  Future<void> refillOpk(Map<String, dynamic> opkData) async {
    await _httpClient.post<void>(
      E2eeEndpoints.opkRefill,
      body: opkData,
      fromJson: (_) {},
    );
  }

  Future<void> deleteExpiredOpk() async {
    await _httpClient.delete<void>(
      E2eeEndpoints.opkExpired,
      fromJson: (_) {},
    );
  }

  /// Legacy OTK count API kept for compatibility.
  Future<int> getOtkCount() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.otkCount,
      fromJson: (json) => json,
    );
    return (response.data['count'] as int?) ?? 0;
  }

  /// Replenish OTK pool.
  Future<void> replenishOtk(Map<String, dynamic> otkData) async {
    await _httpClient.post<void>(
      E2eeEndpoints.otk,
      body: otkData,
      fromJson: (_) {},
    );
  }

  /// Get E2EE salt for key derivation.
  Future<Map<String, dynamic>> getSalt() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.salt,
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Upload encrypted key backup.
  Future<void> uploadKeyBackup(Map<String, dynamic> backupData) async {
    await _httpClient.post<void>(
      E2eeEndpoints.backup,
      body: backupData,
      fromJson: (_) {},
    );
  }

  /// Get encrypted key backup.
  Future<Map<String, dynamic>> getKeyBackup() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.backup,
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Delete a specific E2EE device.
  Future<void> deleteDevice(String deviceId) async {
    await _httpClient.delete<void>(
      E2eeEndpoints.deleteDevice(deviceId),
      fromJson: (_) {},
    );
  }

  /// Create a new E2EE session.
  Future<Map<String, dynamic>> createSession(
      Map<String, dynamic> sessionData) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      E2eeEndpoints.createSession,
      body: sessionData,
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Get the E2EE session for a conversation.
  Future<Map<String, dynamic>> getConversationSession(
      String conversationId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.conversationSession(conversationId),
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Rotate the E2EE session for a conversation.
  Future<Map<String, dynamic>> rotateConversationSession(
    String conversationId,
    Map<String, dynamic> rotationData,
  ) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      E2eeEndpoints.rotateConversationSession(conversationId),
      body: rotationData,
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Enable E2EE for a group.
  Future<void> enableGroupE2ee(
      String groupId, Map<String, dynamic> config) async {
    await _httpClient.post<void>(
      E2eeEndpoints.groupEnable(groupId),
      body: config,
      fromJson: (_) {},
    );
  }

  /// Disable E2EE for a group.
  Future<void> disableGroupE2ee(String groupId) async {
    await _httpClient.post<void>(
      E2eeEndpoints.groupDisable(groupId),
      body: {},
      fromJson: (_) {},
    );
  }

  /// Push sender key for a group.
  Future<void> pushGroupSenderKey(
      String groupId, Map<String, dynamic> keyData) async {
    await _httpClient.post<void>(
      E2eeEndpoints.groupSenderKey(groupId),
      body: keyData,
      fromJson: (_) {},
    );
  }

  /// Get sender keys for a group.
  Future<List<Map<String, dynamic>>> getGroupSenderKeys(String groupId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.groupSenderKeys(groupId),
      fromJson: (json) => json,
    );
    final items = response.data['items'];
    if (items is List) {
      return items
          .whereType<Map>()
          .map((item) => item.map((key, value) => MapEntry('$key', value)))
          .toList();
    }
    return const [];
  }

  /// Remove a member's sender keys from a group.
  Future<void> removeGroupSenderKey(String groupId, String userId) async {
    await _httpClient.delete<void>(
      E2eeEndpoints.groupRemoveSenderKey(groupId, userId),
      fromJson: (_) {},
    );
  }

  /// Get E2EE status for a group.
  Future<Map<String, dynamic>> getGroupE2eeStatus(String groupId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.groupStatus(groupId),
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Get devices in a group for E2EE.
  Future<List<Map<String, dynamic>>> getGroupDevices(String groupId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.groupDevices(groupId),
      fromJson: (json) => json,
    );
    final items = response.data['items'];
    if (items is List) {
      return items
          .whereType<Map>()
          .map((item) => item.map((key, value) => MapEntry('$key', value)))
          .toList();
    }
    return const [];
  }

  /// Get E2EE devices for a specific user (path-based variant).
  Future<List<Map<String, dynamic>>> getDevicesByUser(String userId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.devicesByUser(userId),
      fromJson: (json) => json,
    );
    final items = response.data['items'];
    if (items is List) {
      return items
          .whereType<Map>()
          .map((item) => item.map((key, value) => MapEntry('$key', value)))
          .toList();
    }
    return const [];
  }
}
