/// Single source of truth for route metadata (auth guard + SEO).
///
/// Auth guard fields: requiresAuth, hideForAuth, permission
/// SEO fields: titleKey, descriptionKey, ogImage, ogType
class RouteEntry {
  final String titleKey;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
  final String descriptionKey;
  final String? ogImage;
  final String? ogType;

  const RouteEntry({
    required this.titleKey,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
    required this.descriptionKey,
    this.ogImage,
    this.ogType,
  });
}

const routeRegistry = <String, RouteEntry>{
  '/login': RouteEntry(
    titleKey: 'seoLoginTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'seoLoginDescription',
  ),
  '/register': RouteEntry(
    titleKey: 'seoRegisterTitle',
    requiresAuth: false,
    hideForAuth: true,
    descriptionKey: 'seoRegisterDescription',
  ),
  '/chat': RouteEntry(
    titleKey: 'seoChatTitle',
    descriptionKey: 'seoChatDescription',
  ),
  '/contacts': RouteEntry(
    titleKey: 'seoContactsTitle',
    descriptionKey: 'seoContactsDescription',
  ),
  '/contacts/add': RouteEntry(
    titleKey: 'seoAddFriendTitle',
    descriptionKey: 'seoAddFriendDescription',
  ),
  '/groups': RouteEntry(
    titleKey: 'seoGroupsTitle',
    descriptionKey: 'seoGroupsDescription',
  ),
  '/groups/create': RouteEntry(
    titleKey: 'seoCreateGroupTitle',
    descriptionKey: 'seoCreateGroupDescription',
  ),
  '/moments': RouteEntry(
    titleKey: 'seoMomentsTitle',
    descriptionKey: 'seoMomentsDescription',
  ),
  '/moments/notifications': RouteEntry(
    titleKey: 'seoMomentsNotificationsTitle',
    descriptionKey: 'seoMomentsNotificationsDescription',
  ),
  '/settings': RouteEntry(
    titleKey: 'seoSettingsTitle',
    descriptionKey: 'seoSettingsDescription',
  ),
  '/settings/profile': RouteEntry(
    titleKey: 'seoProfileTitle',
    descriptionKey: 'seoProfileDescription',
  ),
  '/settings/ai': RouteEntry(
    titleKey: 'seoAiSettingsTitle',
    descriptionKey: 'seoAiSettingsDescription',
  ),
};
