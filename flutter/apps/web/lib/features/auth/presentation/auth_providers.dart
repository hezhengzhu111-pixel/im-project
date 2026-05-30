import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/di/third_party_providers.dart';
import '../../../core/network/network_providers.dart';
import '../data/auth_repository_impl.dart';
import 'auth_provider.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
  );
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authRepositoryProvider),
    ref.watch(wsClientProvider),
    ref.watch(httpClientProvider),
    ref.watch(analyticsProvider),
  );
});

final currentUserIdProvider = Provider<String>((ref) {
  return ref.watch(authStateProvider).user?.id ?? '';
});

final isAuthenticatedProvider = Provider<bool>((ref) {
  return ref.watch(authStateProvider).isAuthenticated;
});
