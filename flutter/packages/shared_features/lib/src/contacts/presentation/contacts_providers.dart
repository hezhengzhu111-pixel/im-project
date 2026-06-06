import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import '../data/contacts_api.dart';
import 'contacts_provider.dart';

final contactsApiProvider = Provider<ContactsApi>((ref) {
  return ContactsApi(ref.watch(httpClientProvider));
});

final contactsStateProvider =
    StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(
    ref.watch(contactsApiProvider),
    ref.watch(wsClientProvider),
  );
});
