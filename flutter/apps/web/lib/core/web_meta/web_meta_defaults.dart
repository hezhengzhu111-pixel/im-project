import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/core/router/route_registry.dart';
import 'page_meta.dart';

const appFallbackMeta = PageMeta(
  title: 'IM - 安全即时通讯',
  description:
      'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  canonicalPath: '/',
  og: OgMeta(
    title: 'IM - 安全即时通讯',
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
    type: 'website',
  ),
  twitter: TwitterMeta(
    card: 'summary',
    title: 'IM - 安全即时通讯',
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  ),
);

PageMeta metaForPath(String path, AppLocalizations? l10n) {
  final entry = routeRegistry[path];
  if (entry == null) return appFallbackMeta;

  final title = l10n?.translate(entry.titleKey) ?? entry.titleKey;
  final description =
      l10n?.translate(entry.descriptionKey) ?? entry.descriptionKey;

  return PageMeta(
    title: title,
    description: description,
    canonicalPath: path,
    og: OgMeta(
      title: title,
      description: description,
      image: entry.ogImage,
      type: entry.ogType ?? 'website',
    ),
    twitter: TwitterMeta(
      card: 'summary',
      title: title,
      description: description,
    ),
  );
}
