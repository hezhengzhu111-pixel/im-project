import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/domain/auth_status.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/chat/presentation/chat_provider.dart';

import '../../helpers/fakes.dart';

void main() {
  group('ChatState', () {
    test('initial state has correct defaults', () {
      const state = ChatState();
      expect(state.sessions, isEmpty);
      expect(state.messages, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.activeSessionId, isNull);
      expect(state.error, isNull);
    });

    test('currentMessages returns messages for active session', () {
      final msg = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      final state = ChatState(
        activeSessionId: 's1',
        messages: {'s1': [msg]},
      );
      expect(state.currentMessages.length, 1);
      expect(state.currentMessages.first.content, 'Hello');
    });

    test('currentMessages returns empty when no active session', () {
      final msg = Message(
        id: 'm1',
        senderId: 'u1',
        isGroupChat: false,
        messageType: 'text',
        content: 'Hello',
        sendTime: '2024-01-01T00:00:00Z',
        status: 'sent',
      );
      final state = ChatState(messages: {'s1': [msg]});
      expect(state.currentMessages, isEmpty);
    });

    test('copyWith preserves unmodified fields', () {
      const state = ChatState(
        isLoading: true,
        activeSessionId: 's1',
      );
      final updated = state.copyWith(isLoading: false);
      expect(updated.isLoading, isFalse);
      expect(updated.activeSessionId, 's1');
    });

    test('copyWith error clears on null', () {
      const state = ChatState(error: 'some error');
      final updated = state.copyWith(isLoading: true);
      expect(updated.error, isNull);
    });
  });

  group('AuthState', () {
    test('initial state has correct defaults', () {
      const state = AuthState();
      expect(state.user, isNull);
      expect(state.isAuthenticated, isFalse);
      expect(state.isLoading, isFalse);
      expect(state.error, isNull);
      expect(state.authReady, isFalse);
      expect(state.permissions, isEmpty);
    });

    test('copyWith preserves existing values', () {
      const state = AuthState(
        user: User(id: '1', username: 'test'),
        status: AuthStatus.authenticated,
        error: 'some error',
      );
      final copied = state.copyWith(status: AuthStatus.loading);
      expect(copied.user, state.user);
      expect(copied.isAuthenticated, isFalse);
      expect(copied.isLoading, isTrue);
      // copyWith uses sentinel pattern: error is preserved unless explicitly passed
      expect(copied.error, 'some error');
    });

    test('copyWith updates all fields', () {
      const state = AuthState();
      const newUser = User(id: '2', username: 'other');
      final updated = state.copyWith(
        user: newUser,
        status: AuthStatus.authenticated,
        error: 'new error',
      );
      expect(updated.user, equals(newUser));
      expect(updated.isAuthenticated, isTrue);
      expect(updated.isLoading, isFalse);
      expect(updated.error, 'new error');
    });
  });

  group('ChatPage provider override mechanics', () {
    test('FakeWsClientPort can be created and configured', () {
      final wsClient = FakeWsClientPort();
      expect(wsClient.isConnected, isFalse);
      expect(wsClient.sentMessages, isEmpty);
      wsClient.dispose();
    });

    test('FakeWsClientPort connect sets isConnected', () async {
      final wsClient = FakeWsClientPort();
      await wsClient.connect('ws://localhost');
      expect(wsClient.isConnected, isTrue);
      wsClient.dispose();
    });

    test('FakeWsClientPort send records messages', () {
      final wsClient = FakeWsClientPort();
      wsClient.send({'type': 'test', 'data': 'hello'});
      expect(wsClient.sentMessages.length, 1);
      expect(wsClient.sentMessages[0]['type'], 'test');
      wsClient.dispose();
    });

    test('FakeHttpClientPort can be created', () {
      final httpClient = FakeHttpClientPort();
      expect(httpClient.requests, isEmpty);
    });

    test('FakeSecureStoragePort read/write works', () async {
      final storage = FakeSecureStoragePort();
      await storage.write('key1', 'value1');
      expect(await storage.read('key1'), 'value1');
      expect(await storage.containsKey('key1'), isTrue);
      await storage.delete('key1');
      expect(await storage.read('key1'), isNull);
    });
  });
}
