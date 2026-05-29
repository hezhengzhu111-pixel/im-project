import 'dart:async';

import 'package:im_core/core.dart';
import 'package:im_web/features/e2ee/data/e2ee_manager.dart';

// ---------------------------------------------------------------------------
// 1. FakeWsEvent
// ---------------------------------------------------------------------------

/// A concrete [WsEvent] for use in tests.
class FakeWsEvent implements WsEvent {
  FakeWsEvent({
    required this.type,
    required this.data,
    int? timestamp,
  }) : timestamp = timestamp ?? DateTime.now().millisecondsSinceEpoch;

  @override
  final String type;

  @override
  final Map<String, dynamic> data;

  @override
  final int timestamp;
}

// ---------------------------------------------------------------------------
// 2. FakeHttpClientPort
// ---------------------------------------------------------------------------

/// Records every HTTP call and delegates to configurable callbacks.
class FakeHttpClientPort implements HttpClientPort {
  /// All recorded calls as (method, path, body).
  final List<(String method, String path, dynamic body)> requests = [];

  /// Optional callback for GET requests.
  Future<ApiResponse<T>> Function<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  })? onGet;

  /// Optional callback for POST requests.
  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPost;

  /// Optional callback for PUT requests.
  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPut;

  /// Optional callback for DELETE requests.
  Future<ApiResponse<T>> Function<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  })? onDelete;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('GET', path, null));
    if (onGet != null) {
      return onGet!(path, queryParameters: queryParameters, fromJson: fromJson);
    }
    throw UnimplementedError('No onGet callback configured');
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('POST', path, body));
    if (onPost != null) {
      return onPost!(path, body: body, fromJson: fromJson);
    }
    throw UnimplementedError('No onPost callback configured');
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('PUT', path, body));
    if (onPut != null) {
      return onPut!(path, body: body, fromJson: fromJson);
    }
    throw UnimplementedError('No onPut callback configured');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('DELETE', path, null));
    if (onDelete != null) {
      return onDelete!(
        path,
        queryParameters: queryParameters,
        fromJson: fromJson,
      );
    }
    throw UnimplementedError('No onDelete callback configured');
  }
}

// ---------------------------------------------------------------------------
// 3. FakeWsClientPort
// ---------------------------------------------------------------------------

/// A controllable [WsClientPort] that tracks sent messages.
class FakeWsClientPort implements WsClientPort {
  FakeWsClientPort({this.wsBaseUrl = 'ws://localhost:8082/ws'});

  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController =
      StreamController<WsConnectionState>.broadcast();

  /// Messages that were passed to [send].
  final List<Map<String, dynamic>> sentMessages = [];
  String? lastConnectedUrl;

  bool _connected = false;

  @override
  final String wsBaseUrl;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  Stream<WsConnectionState> get connectionState =>
      _connectionStateController.stream;

  @override
  bool get isConnected => _connected;

  @override
  Future<void> connect(String url) async {
    lastConnectedUrl = url;
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  Future<void> disconnect() async {
    _connected = false;
    _connectionStateController.add(WsConnectionState.disconnected);
  }

  @override
  Future<void> reconnect() async {
    _connectionStateController.add(WsConnectionState.reconnecting);
    _connected = true;
    _connectionStateController.add(WsConnectionState.connected);
  }

  @override
  void send(Map<String, dynamic> message) {
    sentMessages.add(message);
  }

  // -- Test helpers ---------------------------------------------------------

  /// Push an event onto the events stream.
  void addEvent(WsEvent event) => _eventsController.add(event);

  /// Push a connection state onto the connectionState stream.
  void addConnectionState(WsConnectionState state) =>
      _connectionStateController.add(state);

  /// Close both stream controllers.
  void dispose() {
    _eventsController.close();
    _connectionStateController.close();
  }
}

// ---------------------------------------------------------------------------
// 4. FakeSecureStoragePort
// ---------------------------------------------------------------------------

/// In-memory [SecureStoragePort] backed by a [Map].
class FakeSecureStoragePort implements SecureStoragePort {
  final Map<String, String> _storage;

  FakeSecureStoragePort([Map<String, String>? seed]) : _storage = seed ?? {};

  @override
  Future<String?> read(String key) async => _storage[key];

  @override
  Future<void> write(String key, String value) async => _storage[key] = value;

  @override
  Future<void> delete(String key) async => _storage.remove(key);

  @override
  Future<void> deleteAll() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}

// ---------------------------------------------------------------------------
// 5. FakeStoragePort
// ---------------------------------------------------------------------------

/// In-memory [StoragePort] backed by a [Map].
class FakeStoragePort implements StoragePort {
  final Map<String, String> _storage = {};

  @override
  Future<String?> getString(String key) async => _storage[key];

  @override
  Future<void> setString(String key, String value) async =>
      _storage[key] = value;

  @override
  Future<void> remove(String key) async => _storage.remove(key);

  @override
  Future<void> clear() async => _storage.clear();

  @override
  Future<bool> containsKey(String key) async => _storage.containsKey(key);
}

// ---------------------------------------------------------------------------
// 6. FakeE2eeManager
// ---------------------------------------------------------------------------

/// Fake E2eeManager for testing.
///
/// Passes null for all dependency fields because every public method is
/// overridden and none delegate to super. This avoids needing real
/// WebE2eeAdapter, E2eeApi, etc. in tests.
class FakeE2eeManager extends E2eeManager {
  FakeE2eeManager()
      : super(
          adapter: null as dynamic,
          api: null as dynamic,
          keyStore: null as dynamic,
          sessionStore: null as dynamic,
          metaStore: null as dynamic,
          currentUserId: 'test_user_id',
        );

  bool initCalled = false;
  String? lastEncryptSessionId;
  String? lastDecryptSessionId;

  // Note: We do NOT call super.init() to avoid touching the private
  // _initialized field. If E2eeManager adds validation in non-overridden
  // methods, this fake will need updating.
  @override
  Future<void> init() async {
    initCalled = true;
  }

  @override
  Future<String> ensureDeviceRegistered() async => 'fake_device_id';

  @override
  Future<bool> initiateNegotiation(String sessionId, String peerId) async =>
      true;

  @override
  Future<bool> respondToNegotiation(
    String sessionId,
    Map<String, dynamic> requestPayload,
  ) async =>
      true;

  @override
  Future<Map<String, dynamic>> encryptToEnvelope({
    required String sessionId,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String plaintext,
  }) async {
    lastEncryptSessionId = sessionId;
    return {'ciphertext': 'fake_ciphertext'};
  }

  @override
  Future<String> decryptEnvelope({
    required String sessionId,
    required Map<String, dynamic> envelope,
  }) async {
    lastDecryptSessionId = sessionId;
    return 'fake_plaintext';
  }

  @override
  Future<void> exitEncryption(String sessionId) async {}

  @override
  Future<void> rejectNegotiation(String sessionId) async {}
}

// ---------------------------------------------------------------------------
// 7. FakeAuthRepository
// ---------------------------------------------------------------------------

/// A configurable [AuthRepository] for use in tests.
class FakeAuthRepository implements AuthRepository {
  /// Pre-configured response for [login].
  UserAuthResponse? loginResponse;

  /// If set, [login] will throw this instead of returning [loginResponse].
  Exception? loginError;

  /// Pre-configured response for [register].
  UserAuthResponse? registerResponse;

  /// If set, [register] will throw this instead of returning [registerResponse].
  Exception? registerError;

  /// Pre-configured response for [getProfile].
  User? profileResponse;

  /// If set, [getProfile] will throw this.
  Exception? getProfileError;

  /// Value returned by [isAuthenticated].
  bool isAuthenticatedValue = false;

  /// If set, [isAuthenticated] will throw this.
  Exception? isAuthenticatedError;

  /// Value returned by [getToken].
  String? tokenValue;

  /// Number of times [login] was called.
  int loginCallCount = 0;

  /// Number of times [register] was called.
  int registerCallCount = 0;

  /// Number of times [logout] was called.
  int logoutCallCount = 0;

  /// Number of times [isAuthenticated] was called.
  int isAuthenticatedCallCount = 0;

  /// Number of times [getProfile] was called.
  int getProfileCallCount = 0;

  /// Last [LoginRequest] passed to [login].
  LoginRequest? lastLoginRequest;

  /// Last [RegisterRequest] passed to [register].
  RegisterRequest? lastRegisterRequest;

  /// If set, [refreshToken] will throw this.
  Exception? refreshTokenError;

  /// Pre-configured response for [refreshToken].
  UserAuthResponse? refreshTokenResponse;

  /// Value returned by [getRefreshToken].
  String? refreshTokenValue;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    loginCallCount++;
    lastLoginRequest = request;
    if (loginError != null) throw loginError!;
    return loginResponse ?? const UserAuthResponse(success: true);
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    registerCallCount++;
    lastRegisterRequest = request;
    if (registerError != null) throw registerError!;
    return registerResponse ?? const UserAuthResponse(success: true);
  }

  @override
  Future<User> getProfile() async {
    getProfileCallCount++;
    if (getProfileError != null) throw getProfileError!;
    if (profileResponse == null) throw Exception('No profile configured');
    return profileResponse!;
  }

  @override
  Future<void> logout() async {
    logoutCallCount++;
  }

  @override
  Future<bool> isAuthenticated() async {
    isAuthenticatedCallCount++;
    if (isAuthenticatedError != null) throw isAuthenticatedError!;
    return isAuthenticatedValue;
  }

  @override
  Future<String?> getToken() async => tokenValue;

  @override
  Future<String?> getRefreshToken() async => refreshTokenValue;

  @override
  Future<UserAuthResponse> refreshToken() async {
    if (refreshTokenError != null) throw refreshTokenError!;
    return refreshTokenResponse ?? const UserAuthResponse(success: true);
  }
}
