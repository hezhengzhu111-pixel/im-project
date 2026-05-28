import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../core/error/error_notifier.dart';
import '../../core/network/network_status_provider.dart';

// Storage
final secureStorageProvider = Provider<SecureStoragePort>((ref) => WebSecureStorageAdapter());
final storageProvider = Provider<StoragePort>((ref) => WebStorageAdapter());

// HTTP
final httpClientProvider = Provider<HttpClientPort>((ref) {
  return WebHttpClient(
    baseUrl: 'http://localhost:8082',
    secureStorage: ref.watch(secureStorageProvider),
  );
});

// WebSocket
final wsClientProvider = Provider<WsClientPort>((ref) {
  final client = WebWsClient(
    ticketUrl: AuthEndpoints.wsTicket,
    wsBaseUrl: 'ws://localhost:8082${WsEndpoints.path}',
  );
  ref.onDispose(() => client.dispose());
  return client;
});

final wsStateProvider = StreamProvider<WsConnectionState>((ref) {
  return ref.watch(wsClientProvider).connectionState;
});

// Error
final errorProvider = StateNotifierProvider<ErrorNotifier, ErrorState>((ref) {
  return ErrorNotifier();
});

// Language
final languageProvider = StateProvider<String>((ref) => 'zh');

// Theme
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
