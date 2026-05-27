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
  Future<Map<String, dynamic>> getBundle(String userId) async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      E2eeEndpoints.bundleByUser(userId),
      fromJson: (json) => json,
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

  /// Send device heartbeat for key maintenance.
  Future<void> heartbeat() async {
    await _httpClient.post<void>(
      E2eeEndpoints.heartbeat,
      fromJson: (_) {},
    );
  }

  /// Get remaining OTK (One-Time Key) count.
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
}
