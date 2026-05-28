/// Route metadata for auth guards, permissions, and page titles.
class RouteMeta {
  final String title;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;

  const RouteMeta({
    required this.title,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
  });
}
