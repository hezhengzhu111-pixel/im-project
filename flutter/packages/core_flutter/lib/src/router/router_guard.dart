import 'route_meta.dart';

String? authGuardRedirect({
  required bool isAuthenticated,
  required bool isLoading,
  required String currentPath,
  List<String> permissions = const [],
  Map<String, RouteMeta>? routeMetaMap,
}) {
  final meta = resolveRouteMeta(currentPath, routeMetaMap);
  if (meta == null) return null;
  if (isLoading) return null;
  if (meta.hideForAuth && isAuthenticated) return '/chat';
  if (meta.requiresAuth && !isAuthenticated) {
    return '/login?redirect=${Uri.encodeComponent(currentPath)}';
  }
  if (meta.permission != null && !permissions.contains(meta.permission)) {
    return '/chat';
  }
  return null;
}
