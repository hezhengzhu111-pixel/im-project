import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/l10n/app_localizations_ext.dart';
import 'package:im_web/core/router/route_registry.dart';
import 'page_meta.dart';

PageMeta fallbackMetaForLocale(AppLocalizations? l10n) {
  if (l10n != null) {
    return PageMeta(
      title: l10n.seoAppTitle,
      description: l10n.seoAppDescription,
      canonicalPath: '/',
      og: OgMeta(
        title: l10n.seoAppTitle,
        description: l10n.seoAppDescription,
        type: 'website',
      ),
      twitter: TwitterMeta(
        card: 'summary',
        title: l10n.seoAppTitle,
        description: l10n.seoAppDescription,
      ),
    );
  }

  return const PageMeta(
    title: 'IM - Secure Messaging',
    description:
        'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
    canonicalPath: '/',
    og: OgMeta(
      title: 'IM - Secure Messaging',
      description:
          'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
      type: 'website',
    ),
    twitter: TwitterMeta(
      card: 'summary',
      title: 'IM - Secure Messaging',
      description:
          'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
    ),
  );
}

/// Backward-compatible alias for fallbackMetaForLocale(null).
const appFallbackMeta = PageMeta(
  title: 'IM - Secure Messaging',
  description:
      'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
  canonicalPath: '/',
  og: OgMeta(
    title: 'IM - Secure Messaging',
    description:
        'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
    type: 'website',
  ),
  twitter: TwitterMeta(
    card: 'summary',
    title: 'IM - Secure Messaging',
    description:
        'IM is a secure messaging app with end-to-end encryption, group chat, and more.',
  ),
);

PageMeta metaForPath(String path, AppLocalizations? l10n) {
  final entry = routeRegistry[path];
  if (entry == null) return fallbackMetaForLocale(l10n);

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
