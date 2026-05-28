import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Abstract permission API for fetching user permissions.
abstract class PermissionApi {
  Future<List<String>> fetchPermissions();
}

/// Permission state holding the user's permission set.
class PermissionState {
  final Set<String> permissions;
  final bool isLoading;

  const PermissionState({this.permissions = const {}, this.isLoading = false});

  PermissionState copyWith({Set<String>? permissions, bool? isLoading}) {
    return PermissionState(
      permissions: permissions ?? this.permissions,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Manages user permissions, loaded after authentication.
class PermissionNotifier extends StateNotifier<PermissionState> {
  PermissionNotifier(this._api) : super(const PermissionState());

  final PermissionApi _api;

  Future<void> loadPermissions() async {
    state = state.copyWith(isLoading: true);
    try {
      final perms = await _api.fetchPermissions();
      state = PermissionState(permissions: perms.toSet());
    } catch (e) {
      state = const PermissionState();
    }
  }

  bool hasPermission(String permission) => state.permissions.contains(permission);
}

final permissionProvider =
    StateNotifierProvider<PermissionNotifier, PermissionState>((ref) {
  return PermissionNotifier(ref.watch(permissionApiProvider));
});

/// Provider for the permission API implementation.
final permissionApiProvider = Provider<PermissionApi>((ref) {
  return EmptyPermissionApi();
});

/// Minimal implementation returning empty permissions.
/// Replace with real API when backend supports it.
class EmptyPermissionApi implements PermissionApi {
  @override
  Future<List<String>> fetchPermissions() async => [];
}
