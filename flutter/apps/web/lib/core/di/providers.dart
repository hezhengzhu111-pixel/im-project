import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../features/auth/data/auth_repository_impl.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/chat/data/message_api.dart';
import '../../features/chat/data/message_pipeline.dart';
import '../../features/chat/presentation/chat_provider.dart';
import '../../features/contacts/data/contacts_api.dart';
import '../../features/contacts/presentation/contacts_provider.dart';
import '../../features/moments/data/moments_api.dart';
import '../../features/moments/data/moments_repository.dart';
import '../../features/moments/presentation/moments_provider.dart';
import '../../features/settings/data/settings_api.dart';
import '../../features/settings/data/ai_api.dart';
import '../../features/settings/presentation/settings_provider.dart';
import '../../features/settings/presentation/ai_settings_provider.dart';
import '../../features/settings/presentation/profile_provider.dart';
import '../../features/group/data/group_api.dart';
import '../../features/group/presentation/group_provider.dart';
import '../../features/chat/data/file_api.dart';
import '../../adapters/web_e2ee_adapter.dart';
import '../../features/e2ee/data/e2ee_api.dart';
import '../../features/e2ee/data/e2ee_key_store.dart';
import '../../features/e2ee/data/e2ee_session_store.dart';
import '../../features/e2ee/data/e2ee_meta_store.dart';
import '../../features/e2ee/data/e2ee_manager.dart';
import '../../core/error/error_notifier.dart';

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
  return AuthNotifier(ref.watch(authRepositoryProvider), ref.watch(wsClientProvider), ref.watch(httpClientProvider));
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

// Message
final messageApiProvider = Provider<MessageApi>((ref) => MessageApi(ref.watch(httpClientProvider)));
final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(messageApiProvider),
    MessagePipeline(),
    ref.watch(wsClientProvider),
    () => ref.read(authStateProvider).user?.id ?? '',
  );
});

// Contacts
final contactsApiProvider = Provider<ContactsApi>((ref) => ContactsApi(ref.watch(httpClientProvider)));
final contactsStateProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(ref.watch(contactsApiProvider), ref.watch(wsClientProvider));
});

// Moments
final momentsApiProvider = Provider<MomentsApi>((ref) => MomentsApi(ref.watch(httpClientProvider)));
final momentsRepositoryProvider = Provider<MomentsRepository>((ref) {
  return MomentsRepository(ref.watch(momentsApiProvider), ref.watch(fileApiProvider));
});
final momentsStateProvider = StateNotifierProvider<MomentsNotifier, MomentsState>((ref) {
  return MomentsNotifier(ref.watch(momentsApiProvider));
});

// Settings
final settingsApiProvider = Provider<SettingsApi>((ref) => SettingsApi(ref.watch(httpClientProvider)));
final settingsStateProvider = StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});

// Group
final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider = StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider));
});

// Error
final errorProvider = StateNotifierProvider<ErrorNotifier, ErrorState>((ref) {
  return ErrorNotifier();
});

// File
final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider));
});

// AI
final aiApiProvider = Provider<AiApi>((ref) => AiApi(ref.watch(httpClientProvider)));
final aiSettingsStateProvider = StateNotifierProvider<AiSettingsNotifier, AiSettingsState>((ref) {
  return AiSettingsNotifier(ref.watch(aiApiProvider));
});

// Profile
final profileStateProvider = StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  return ProfileNotifier(ref.watch(settingsApiProvider));
});

// Language
final languageProvider = StateProvider<String>((ref) => 'zh');

// Theme
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

// E2EE
final e2eeAdapterProvider = Provider<WebE2eeAdapter>((ref) {
  return WebE2eeAdapter();
});

final e2eeApiProvider = Provider<E2eeApi>((ref) {
  return E2eeApi(ref.watch(httpClientProvider));
});

final e2eeKeyStoreProvider = Provider<E2eeKeyStore>((ref) {
  final store = E2eeKeyStore();
  ref.onDispose(() => store.dispose());
  return store;
});

final e2eeSessionStoreProvider = Provider<E2eeSessionStore>((ref) {
  final store = E2eeSessionStore();
  ref.onDispose(() => store.dispose());
  return store;
});

final e2eeMetaStoreProvider = Provider<E2eeMetaStore>((ref) {
  return E2eeMetaStore(ref.watch(secureStorageProvider));
});

final e2eeManagerProvider = Provider<E2eeManager>((ref) {
  final authState = ref.watch(authStateProvider);
  return E2eeManager(
    adapter: ref.watch(e2eeAdapterProvider),
    api: ref.watch(e2eeApiProvider),
    keyStore: ref.watch(e2eeKeyStoreProvider),
    sessionStore: ref.watch(e2eeSessionStoreProvider),
    metaStore: ref.watch(e2eeMetaStoreProvider),
    currentUserId: authState.user?.id ?? '',
  );
});

final e2eeSessionStatusProvider = FutureProvider.family<String, String>((ref, sessionId) async {
  final metaStore = ref.watch(e2eeMetaStoreProvider);
  return metaStore.getSessionStatus(sessionId);
});
