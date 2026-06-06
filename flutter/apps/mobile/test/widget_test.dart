import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_mobile/app.dart';
import 'package:im_mobile/core/di/platform_providers.dart';
import 'package:im_mobile/core/router/app_router.dart';
import 'package:im_shared_features/src/auth/auth.dart';

// ---------------------------------------------------------------------------
// Minimal mock implementations for platform ports
// ---------------------------------------------------------------------------

class _MockHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError('mock');

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError('mock');

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError('mock');

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async =>
      throw UnimplementedError('mock');
}

class _MockWsClientPort implements WsClientPort {
  @override
  Stream<WsEvent> get events => const Stream.empty();

  @override
  Stream<WsConnectionState> get connectionState =>
      Stream.value(WsConnectionState.disconnected);

  @override
  bool get isConnected => false;

  @override
  String get wsBaseUrl => '';

  @override
  Future<void> connect(String url) async {}

  @override
  Future<void> disconnect() async {}

  @override
  Future<void> reconnect() async {}

  @override
  void send(Map<String, dynamic> message) {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  testWidgets('App should render login page when not authenticated',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          // Redirect to /login so we avoid deep provider dependencies
          mobileAuthStateProvider.overrideWith(
            (ref) => const MobileAuthState(
              isAuthenticated: false,
              isLoading: false,
            ),
          ),
          httpClientProvider.overrideWithValue(_MockHttpClientPort()),
          wsClientProvider.overrideWithValue(_MockWsClientPort()),
          analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
        ],
        child: const App(),
      ),
    );
    await tester.pumpAndSettle();

    // App should render and navigate to the login page
    expect(find.byType(App), findsOneWidget);
    expect(find.byType(LoginPage), findsOneWidget);
  });
}
