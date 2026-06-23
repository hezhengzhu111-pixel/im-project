import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

import '../../helpers/fakes.dart';

class _RecordingAnalyticsPort implements AnalyticsPort {
  String? lastUserId;
  final List<(String, Map<String, dynamic>?)> events = [];

  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    events.add((eventName, properties));
  }

  @override
  void setUserId(String? userId) {
    lastUserId = userId;
  }

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}

void main() {
  group('AuthNotifier lifecycle', () {
    late FakeAuthRepository mockRepo;
    late FakeWsClientPort mockWsClient;
    late FakeHttpClientPort mockHttpClient;
    late _RecordingAnalyticsPort analytics;
    late AuthNotifier notifier;

    setUp(() {
      mockRepo = FakeAuthRepository();
      mockWsClient = FakeWsClientPort();
      mockHttpClient = FakeHttpClientPort();
      analytics = _RecordingAnalyticsPort();
      notifier = AuthNotifier(
        mockRepo,
        mockWsClient,
        mockHttpClient,
        analytics,
      );
    });

    tearDown(() {
      mockWsClient.dispose();
    });

    test('login sets analytics userId', () async {
      const user = User(id: 'u1', username: 'alice');
      mockRepo.loginResponse = const UserAuthResponse(
        success: true,
        user: user,
      );

      await notifier.login('alice', 'secret');

      expect(notifier.state.isAuthenticated, isTrue);
      expect(analytics.lastUserId, 'u1');
    });

    test('restoreSession sets analytics userId', () async {
      const user = User(id: 'u2', username: 'bob');
      mockRepo.restoreSessionResponse = AuthSuccess(
        user: user,
        permissions: const [],
      );

      await notifier.restoreSession();

      expect(notifier.state.isAuthenticated, isTrue);
      expect(analytics.lastUserId, 'u2');
    });

    test('logout clears analytics userId', () async {
      const user = User(id: 'u3', username: 'carol');
      mockRepo.loginResponse = const UserAuthResponse(
        success: true,
        user: user,
      );
      await notifier.login('carol', 'secret');
      expect(analytics.lastUserId, 'u3');

      await notifier.logout();

      expect(notifier.state.isAuthenticated, isFalse);
      expect(analytics.lastUserId, isNull);
    });

    test('invalidateSession clears state and analytics userId', () async {
      const user = User(id: 'u4', username: 'dave');
      mockRepo.loginResponse = const UserAuthResponse(
        success: true,
        user: user,
      );
      await notifier.login('dave', 'secret');
      expect(notifier.state.isAuthenticated, isTrue);

      notifier.invalidateSession();

      expect(notifier.state.isAuthenticated, isFalse);
      expect(analytics.lastUserId, isNull);
      expect(mockWsClient.lastConnectedUrl, isNull);
    });
  });
}
