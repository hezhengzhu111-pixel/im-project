import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/platform_providers.dart';
import '../data/group_api.dart';
import 'group_provider.dart';

final groupApiProvider = Provider<GroupApi>((ref) {
  return GroupApi(ref.watch(httpClientProvider));
});

final groupStateProvider =
    StateNotifierProvider<GroupNotifier, GroupState>((ref) {
  return GroupNotifier(ref.watch(groupApiProvider));
});
