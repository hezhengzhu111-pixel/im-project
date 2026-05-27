import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../features/auth/data/auth_repository_impl.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/chat/data/message_api.dart';
import '../../features/chat/presentation/chat_provider.dart';
import '../../features/contacts/data/contacts_api.dart';
import '../../features/contacts/presentation/contacts_provider.dart';
import '../../features/moments/data/moments_api.dart';
import '../../features/moments/presentation/moments_provider.dart';
import '../../features/settings/data/settings_api.dart';
import '../../features/settings/presentation/settings_provider.dart';

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

// Auth
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});

// Message
final messageApiProvider = Provider<MessageApi>((ref) => MessageApi(ref.watch(httpClientProvider)));
final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref.watch(messageApiProvider));
});

// Contacts
final contactsApiProvider = Provider<ContactsApi>((ref) => ContactsApi(ref.watch(httpClientProvider)));
final contactsStateProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(ref.watch(contactsApiProvider));
});

// Moments
final momentsApiProvider = Provider<MomentsApi>((ref) => MomentsApi(ref.watch(httpClientProvider)));
final momentsStateProvider = StateNotifierProvider<MomentsNotifier, MomentsState>((ref) {
  return MomentsNotifier(ref.watch(momentsApiProvider));
});

// Settings
final settingsApiProvider = Provider<SettingsApi>((ref) => SettingsApi(ref.watch(httpClientProvider)));
final settingsStateProvider = StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});
