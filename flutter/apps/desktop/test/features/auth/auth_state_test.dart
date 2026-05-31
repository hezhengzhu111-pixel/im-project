import 'package:flutter_test/flutter_test.dart';
import 'package:im_desktop/features/auth/presentation/auth_provider.dart';
import 'package:im_desktop/features/auth/domain/auth_status.dart';
import 'package:im_core/core.dart';

void main() {
  group('AuthState', () {
    test('should have initial state with defaults', () {
      const state = AuthState();
      expect(state.status, AuthStatus.initial);
      expect(state.isAuthenticated, false);
      expect(state.user, null);
      expect(state.error, null);
      expect(state.errorCode, null);
      expect(state.rememberMe, false);
      expect(state.permissions, isEmpty);
    });

    test('isAuthenticated should be true when status is authenticated', () {
      const state = AuthState(status: AuthStatus.authenticated);
      expect(state.isAuthenticated, true);
    });

    test('isLoading should be true when status is loading', () {
      const state = AuthState(status: AuthStatus.loading);
      expect(state.isLoading, true);
    });

    test('authReady should be true when not initial or loading', () {
      const state = AuthState(status: AuthStatus.authenticated);
      expect(state.authReady, true);
    });

    test('authReady should be false when initial', () {
      const state = AuthState(status: AuthStatus.initial);
      expect(state.authReady, false);
    });

    test('authReady should be false when loading', () {
      const state = AuthState(status: AuthStatus.loading);
      expect(state.authReady, false);
    });

    test('copyWith should update status', () {
      const state = AuthState();
      final newState = state.copyWith(status: AuthStatus.authenticated);
      expect(newState.status, AuthStatus.authenticated);
      expect(newState.isAuthenticated, true);
    });

    test('copyWith should update error', () {
      const state = AuthState();
      final newState = state.copyWith(error: 'Test error');
      expect(newState.error, 'Test error');
    });

    test('copyWith should update rememberMe', () {
      const state = AuthState();
      final newState = state.copyWith(rememberMe: true);
      expect(newState.rememberMe, true);
    });

    test('copyWith should update permissions', () {
      const state = AuthState();
      final newState =
          state.copyWith(permissions: ['read', 'write']);
      expect(newState.permissions, ['read', 'write']);
    });

    test('copyWith should preserve unchanged fields', () {
      const state = AuthState(
        status: AuthStatus.authenticated,
        error: 'old error',
        rememberMe: true,
      );
      final newState = state.copyWith(status: AuthStatus.unauthenticated);
      expect(newState.status, AuthStatus.unauthenticated);
      expect(newState.error, 'old error');
      expect(newState.rememberMe, true);
    });

    test('copyWith should allow setting error to null via sentinel', () {
      const state = AuthState(error: 'some error');
      // Passing null directly as error sets it to null (not sentinel)
      final newState = state.copyWith(error: null);
      expect(newState.error, isNull);
    });

    test('copyWith should preserve user when not specified', () {
      final user = User(id: '1', username: 'testuser');
      final state = AuthState(user: user);
      final newState = state.copyWith(status: AuthStatus.authenticated);
      expect(newState.user, user);
    });

    test('permissions should be unmodifiable list', () {
      const state = AuthState(permissions: ['read', 'write']);
      expect(() => state.permissions.add('delete'), throwsUnsupportedError);
    });
  });
}
