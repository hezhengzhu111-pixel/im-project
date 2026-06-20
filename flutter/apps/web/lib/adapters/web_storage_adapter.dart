// ignore_for_file: deprecated_member_use

import 'dart:html' as html;

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

/// Returns `true` if [error] indicates FlutterSecureStorage failed because
/// the page is not in a browser secure context (HTTPS or localhost).
bool _isInsecureContextError(Object error) {
  final message = error.toString().toLowerCase();
  return message.contains('secure context') ||
      message.contains('only works in secure contexts') ||
      message.contains('crypto.subtle');
}

/// A web storage adapter that falls back to `window.localStorage` when
/// `FlutterSecureStorage` is unavailable (e.g. served over HTTP on a public IP).
///
/// Important: the fallback is **not encrypted** and should only be used for
/// development or deployments where HTTPS cannot be enabled. Production must
/// always use HTTPS so `FlutterSecureStorage` can use the Web Crypto API.
mixin _StorageFallbackMixin {
  final _storage = const FlutterSecureStorage();

  /// Cached flag so we don't keep throwing the same secure-context error.
  bool? _secureStorageAvailable;

  void _warnFallback() {
    if (kDebugMode || kProfileMode) {
      // ignore: avoid_print
      print(
        '[WebStorageAdapter] FlutterSecureStorage unavailable in non-secure '
        'context; falling back to localStorage. '
        'Deploy over HTTPS for secure storage.',
      );
    }
  }

  Future<T> _withFallback<T>(
    Future<T> Function() secureOp,
    Future<T> Function() fallbackOp,
  ) async {
    if (_secureStorageAvailable == true) {
      return secureOp();
    }
    if (_secureStorageAvailable == false) {
      return fallbackOp();
    }
    try {
      final result = await secureOp();
      _secureStorageAvailable = true;
      return result;
    } catch (e) {
      if (_isInsecureContextError(e)) {
        _secureStorageAvailable = false;
        _warnFallback();
        return fallbackOp();
      }
      rethrow;
    }
  }
}

class WebStorageAdapter implements StoragePort {
  final _fallback = _WebStorageFallback();

  @override
  Future<String?> getString(String key) => _fallback.read(key);

  @override
  Future<void> setString(String key, String value) => _fallback.write(key, value);

  @override
  Future<void> remove(String key) => _fallback.delete(key);

  @override
  Future<void> clear() => _fallback.deleteAll();

  @override
  Future<bool> containsKey(String key) => _fallback.containsKey(key);
}

class WebSecureStorageAdapter implements SecureStoragePort {
  final _fallback = _WebStorageFallback();

  @override
  Future<String?> read(String key) => _fallback.read(key);

  @override
  Future<void> write(String key, String value) => _fallback.write(key, value);

  @override
  Future<void> delete(String key) => _fallback.delete(key);

  @override
  Future<void> deleteAll() => _fallback.deleteAll();

  @override
  Future<bool> containsKey(String key) => _fallback.containsKey(key);
}

/// Internal helper that prefers `FlutterSecureStorage` and falls back to
/// `window.localStorage` on non-secure contexts.
class _WebStorageFallback with _StorageFallbackMixin {
  Future<String?> read(String key) => _withFallback(
        () => _storage.read(key: key),
        () async => html.window.localStorage[key],
      );

  Future<void> write(String key, String value) => _withFallback(
        () => _storage.write(key: key, value: value),
        () async => html.window.localStorage[key] = value,
      );

  Future<void> delete(String key) => _withFallback(
        () => _storage.delete(key: key),
        () async => html.window.localStorage.remove(key),
      );

  Future<void> deleteAll() => _withFallback(
        () => _storage.deleteAll(),
        () async => html.window.localStorage.clear(),
      );

  Future<bool> containsKey(String key) => _withFallback(
        () => _storage.containsKey(key: key),
        () async => html.window.localStorage.containsKey(key),
      );
}
