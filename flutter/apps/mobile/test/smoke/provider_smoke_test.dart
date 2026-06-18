/// P0-3 Provider smoke test for Mobile platform.
///
/// Verifies that all 8 critical infrastructure providers can be read
/// without throwing UnimplementedError when ProviderScope overrides
/// are applied (mirroring what mobile/main.dart does at startup).
///
/// Also verifies that the default providers DO throw UnimplementedError,
/// confirming the architecture boundary is intact.
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart' as core_flutter;

// ============================================================================
// Fake implementations
// ============================================================================

class _FakeSecureStoragePort implements SecureStoragePort {
  final Map<String, String> _store = {};
  @override
  Future<String?> read(String key) async => _store[key];
  @override
  Future<void> write(String key, String value) async => _store[key] = value;
  @override
  Future<void> delete(String key) async => _store.remove(key);
  @override
  Future<void> deleteAll() async => _store.clear();
  @override
  Future<bool> containsKey(String key) async => _store.containsKey(key);
}

class _FakeStoragePort implements StoragePort {
  final Map<String, String> _store = {};
  @override
  Future<String?> getString(String key) async => _store[key];
  @override
  Future<void> setString(String key, String value) async => _store[key] = value;
  @override
  Future<void> remove(String key) async => _store.remove(key);
  @override
  Future<void> clear() async => _store.clear();
  @override
  Future<bool> containsKey(String key) async => _store.containsKey(key);
}

class _FakeHttpClientPort implements HttpClientPort {
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final empty = <dynamic>[];
    return ApiResponse<T>(code: 200, message: 'ok', data: empty as T);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final empty = <dynamic>[];
    return ApiResponse<T>(code: 200, message: 'ok', data: empty as T);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError('put');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic body,
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    throw UnimplementedError('delete');
  }
}

class _FakeWsClientPort implements WsClientPort {
  final _eventsController = StreamController<WsEvent>.broadcast();
  final _connectionStateController =
      StreamController<WsConnectionState>.broadcast();

  @override
  Stream<WsEvent> get events => _eventsController.stream;
  @override
  Stream<WsConnectionState> get connectionState =>
      _connectionStateController.stream;
  @override
  bool get isConnected => false;
  @override
  String get wsBaseUrl => 'ws://localhost:8082/ws';
  @override
  Future<void> connect(String url) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> reconnect() async {}
  @override
  void send(Map<String, dynamic> message) {}
}

class _FakeE2eeBridge extends E2eeBridge {
  @override
  Future<Uint8List> generateKeyBundle(int otkCount) async => Uint8List(0);
  @override
  Future<Uint8List> x3dhInitiate(
          Uint8List ik, Uint8List spk, Uint8List? otk) async =>
      Uint8List(0);
  @override
  Future<Uint8List> x3dhRespond(
          Uint8List ik, Uint8List ek, Uint8List spk, Uint8List? otk) async =>
      Uint8List(0);
  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
          Uint8List state, Uint8List plaintext) async =>
      (Uint8List(0), Uint8List(0));
  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
          Uint8List state, Uint8List ciphertext) async =>
      (Uint8List(0), Uint8List(0));
  @override
  Future<Uint8List> exportState(Uint8List state) async => Uint8List(0);
  @override
  Future<Uint8List> restoreState(Uint8List state) async => Uint8List(0);
  @override
  Future<Map<String, dynamic>> generateKeyBundleJson(int otkCount) async => {};
  @override
  Future<Map<String, dynamic>> createOutboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String remoteBundleBase64,
  }) async =>
      {};
  @override
  Future<Map<String, dynamic>> createInboundSession({
    required String sessionId,
    required String localIdentityKeyPairBase64,
    required String localSpkPairBase64,
    String? localOtkPairBase64,
    required String remoteIdentityKeyBase64,
    required String remoteHandshakeBase64,
  }) async =>
      {};
  @override
  Future<Map<String, dynamic>> encryptMessage({
    required String stateBase64,
    required String plaintextBase64,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String sessionId,
    String? handshakeBase64,
  }) async =>
      {};
  @override
  Future<Map<String, dynamic>> decryptMessage({
    required String stateBase64,
    required Map<String, dynamic> envelope,
  }) async =>
      {};
  @override
  Future<String> exportSessionEnvelope({
    required String stateBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async =>
      '';
  @override
  Future<String> restoreSessionEnvelope({
    required String envelopeBase64,
    required String userId,
    required String deviceId,
    required String sessionId,
    required String remoteUserId,
    required String remoteDeviceId,
  }) async =>
      '';
}

class _FakeAnalyticsPort implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}
  @override
  void setUserId(String? userId) {}
  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}

class _FakeErrorReporterPort implements ErrorReporterPort {
  @override
  void reportError(SanitizedError error) {}
  @override
  void reportMessage(String message, {String? level}) {}
}

// NoopPushPort from im_core is used directly — no custom fake needed.

// ============================================================================
// Tests
// ============================================================================

const _p0RequiredProviders = <String>[
  'secureStorageProvider',
  'storageProvider',
  'httpClientProvider',
  'wsClientProvider',
  'e2eeAdapterProvider',
  'analyticsProvider',
  'errorReporterProvider',
  'pushProvider',
];

void main() {
  group('P0-3 Mobile Provider smoke', () {
    // -------------------------------------------------------------------
    // Test: All 8 critical providers resolve without UnimplementedError
    // -------------------------------------------------------------------
    test('all 8 critical providers resolve without UnimplementedError', () {
      final container = ProviderContainer(overrides: [
        core_flutter.secureStorageProvider
            .overrideWithValue(_FakeSecureStoragePort()),
        core_flutter.storageProvider.overrideWithValue(_FakeStoragePort()),
        core_flutter.httpClientProvider
            .overrideWithValue(_FakeHttpClientPort()),
        core_flutter.wsClientProvider.overrideWithValue(_FakeWsClientPort()),
        core_flutter.e2eeAdapterProvider.overrideWithValue(_FakeE2eeBridge()),
        core_flutter.analyticsProvider.overrideWithValue(_FakeAnalyticsPort()),
        core_flutter.errorReporterProvider
            .overrideWithValue(_FakeErrorReporterPort()),
        core_flutter.pushProvider.overrideWithValue(NoopPushPort()),
      ]);

      final results = <String, bool>{};
      for (final name in _p0RequiredProviders) {
        try {
          _readProvider(container, name);
          results[name] = true;
        } catch (e) {
          results[name] = false;
        }
      }

      final failures =
          results.entries.where((e) => !e.value).map((e) => e.key).toList();

      expect(failures, isEmpty,
          reason: 'Providers threw during read: $failures');
    });

    // -------------------------------------------------------------------
    // Test: Default providers throw UnimplementedError (boundary check)
    // -------------------------------------------------------------------
    test('default providers throw UnimplementedError without overrides', () {
      final container = ProviderContainer();

      for (final name in _p0RequiredProviders) {
        expect(
          () => _readProvider(container, name),
          throwsUnimplementedError,
          reason: '$name should throw UnimplementedError when not overridden',
        );
      }
    });
  });
}

dynamic _readProvider(ProviderContainer container, String name) {
  switch (name) {
    case 'secureStorageProvider':
      return container.read(core_flutter.secureStorageProvider);
    case 'storageProvider':
      return container.read(core_flutter.storageProvider);
    case 'httpClientProvider':
      return container.read(core_flutter.httpClientProvider);
    case 'wsClientProvider':
      return container.read(core_flutter.wsClientProvider);
    case 'e2eeAdapterProvider':
      return container.read(core_flutter.e2eeAdapterProvider);
    case 'analyticsProvider':
      return container.read(core_flutter.analyticsProvider);
    case 'errorReporterProvider':
      return container.read(core_flutter.errorReporterProvider);
    case 'pushProvider':
      return container.read(core_flutter.pushProvider);
    default:
      throw ArgumentError('Unknown provider: $name');
  }
}
