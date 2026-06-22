import 'package:im_core/core.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';

/// Fake FilePickerPort for tests.
class FakeFilePickerPort implements FilePickerPort {
  FakeFilePickerPort({this.imageResult, this.fileResult});

  Future<Result<PickedFile>> Function()? imageResult;
  Future<Result<PickedFile>> Function()? fileResult;

  @override
  Future<Result<PickedFile>> pickImage(
      {ImageSource source = ImageSource.gallery}) async {
    if (imageResult != null) return imageResult!();
    return const Failure(OperationCancelled());
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    if (fileResult != null) return fileResult!();
    return const Failure(OperationCancelled());
  }
}

/// Fake HttpClientPort for unit tests that records calls and delegates to
/// configurable callbacks.
class FakeHttpClientPort implements HttpClientPort {
  final List<(String method, String path, dynamic body)> requests = [];

  Future<ApiResponse<T>> Function<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  })? onGet;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPost;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  })? onPut;

  Future<ApiResponse<T>> Function<T>(
    String path, {
    dynamic body,
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
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    requests.add(('DELETE', path, body));
    if (onDelete != null) {
      return onDelete!(
        path,
        body: body,
        queryParameters: queryParameters,
        fromJson: fromJson,
      );
    }
    throw UnimplementedError('No onDelete callback configured');
  }
}

/// Fake StoragePort that keeps values in memory.
class FakeStoragePort implements StoragePort {
  final _values = <String, String>{};

  @override
  Future<String?> getString(String key) async => _values[key];

  @override
  Future<void> setString(String key, String value) async =>
      _values[key] = value;

  @override
  Future<void> remove(String key) async => _values.remove(key);

  @override
  Future<void> clear() async => _values.clear();

  @override
  Future<bool> containsKey(String key) async => _values.containsKey(key);
}

/// Fake AnalyticsPort that discards all events.
class FakeAnalyticsPort implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}

/// Fake WsClientPort for tests.
class FakeWsClient implements WsClientPort {
  @override
  Stream<WsEvent> get events => const Stream.empty();
  @override
  Stream<WsConnectionState> get connectionState => const Stream.empty();
  @override
  bool get isConnected => true;
  @override
  String get wsBaseUrl => 'ws://localhost';
  @override
  Future<void> connect(String url) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> reconnect() async {}
  @override
  void send(Map<String, dynamic> message) {}
  @override
  void dispose() {}
}

/// Fake AuthRepository for tests.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.user});
  final User? user;

  User get _user =>
      user ?? const User(id: 'u1', username: 'testuser', nickname: 'Test');

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    return UserAuthResponse(success: true, user: _user, token: 'fake-token');
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    return UserAuthResponse(success: true, user: _user, token: 'fake-token');
  }

  @override
  Future<AuthResult> restoreSession() async {
    return AuthSuccess(user: _user, permissions: []);
  }

  @override
  Future<void> logout() async {}
}

/// Creates an AuthNotifier pre-populated with an authenticated user.
///
/// Use in tests that need authStateProvider to resolve without
/// complex platform adapter setup.
AuthNotifier createTestAuthNotifier({
  User? user,
  HttpClientPort? httpClient,
}) {
  final http = httpClient ?? FakeHttpClientPort();
  final authenticatedUser = user ??
      const User(
        id: 'u1',
        username: 'testuser',
        nickname: 'Test User',
        email: 'test@example.com',
      );
  final notifier = AuthNotifier(
    FakeAuthRepository(user: authenticatedUser),
    FakeWsClient(),
    http,
    FakeAnalyticsPort(),
  );
  // Set authenticated state immediately so the page doesn't show loading.
  notifier.state = AuthState(
    user: authenticatedUser,
    status: AuthStatus.authenticated,
  );
  return notifier;
}

/// A lightweight [ChatNotifier] for tests that only need an empty chat state.
class FakeChatNotifier extends ChatNotifier {
  FakeChatNotifier()
      : super(
          MessageApi(FakeHttpClientPort()),
          MessagePipeline(),
          FakeWsClient(),
          () => 'u1',
        );
}

/// Returns a default onGet handler for AiSettings-aware tests.
///
/// Distinguishes between AiEndpoints.settings (returns AiSettings JSON)
/// and other paths (returns empty items list).
Future<ApiResponse<T>> Function<T>(
  String path, {
  Map<String, dynamic>? queryParameters,
  required T Function(Map<String, dynamic>) fromJson,
}) aiAwareOnGet() {
  return <T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    if (path == AiEndpoints.settings) {
      return ApiResponse<T>(
        code: 200,
        message: 'ok',
        data: fromJson({
          'autoReplyEnabled': false,
          'autoReplyPersona': '',
        }),
      );
    }
    return ApiResponse<T>(
      code: 200,
      message: 'ok',
      data: fromJson({'items': <dynamic>[]}),
    );
  };
}
