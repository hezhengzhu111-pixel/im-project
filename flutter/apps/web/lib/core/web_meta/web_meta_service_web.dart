import 'package:web/web.dart' as web;
import 'page_meta.dart';
import 'web_meta_service.dart';

class WebMetaServiceImpl implements WebMetaService {
  String get _baseUrl => web.window.location.origin;

  static const _supportedLocales = ['zh', 'en'];

  @override
  void apply(PageMeta meta, {String? locale}) {
    _setTitle(meta.title);
    _setMeta('description', meta.description);
    _setCanonical(meta.canonicalPath);
    _setOg(meta);
    _setTwitter(meta);
    if (locale != null) {
      _setLocale(locale);
    }
  }

  void _setTitle(String title) {
    web.document.title = title;
  }

  void _setMeta(String name, String content) {
    final existing = web.document.querySelector('meta[name="$name"]');
    if (existing != null) {
      existing.setAttribute('content', content);
    } else {
      final el = web.document.createElement('meta') as web.HTMLMetaElement;
      el.name = name;
      el.content = content;
      web.document.head?.appendChild(el);
    }
  }

  void _setCanonical(String? path) {
    final href = path != null ? '$_baseUrl$path' : '$_baseUrl/';
    final existing = web.document.querySelector('link[rel="canonical"]');
    if (existing != null) {
      existing.setAttribute('href', href);
    } else {
      final el = web.document.createElement('link') as web.HTMLLinkElement;
      el.rel = 'canonical';
      el.href = href;
      web.document.head?.appendChild(el);
    }
  }

  void _setOg(PageMeta meta) {
    final og = meta.og;
    final ogTitle = og?.title ?? meta.title;
    final ogDesc = og?.description ?? meta.description;
    final ogType = og?.type ?? 'website';
    final ogUrl = '${_baseUrl}${meta.canonicalPath ?? '/'}';

    _setProperty('og:title', ogTitle);
    _setProperty('og:description', ogDesc);
    _setProperty('og:type', ogType);
    _setProperty('og:url', ogUrl);

    if (og?.image != null) {
      _setProperty('og:image', og!.image!);
    }
  }

  void _setTwitter(PageMeta meta) {
    final twitter = meta.twitter;
    final twCard = twitter?.card ?? 'summary';
    final twTitle = twitter?.title ?? meta.title;
    final twDesc = twitter?.description ?? meta.description;

    _setMeta('twitter:card', twCard);
    _setMeta('twitter:title', twTitle);
    _setMeta('twitter:description', twDesc);

    if (twitter?.image != null) {
      _setMeta('twitter:image', twitter!.image!);
    }
  }

  void _setLocale(String locale) {
    web.document.documentElement?.setAttribute('lang', locale);

    final ogLocale = locale.replaceAll('-', '_');
    _setProperty('og:locale', ogLocale);

    for (final alt in _supportedLocales) {
      if (alt != locale) {
        final altOg = alt.replaceAll('-', '_');
        _setProperty('og:locale:alternate', altOg);
      }
    }
  }

  void _setProperty(String property, String content) {
    final selector = 'meta[property="$property"]';
    final existing = web.document.querySelector(selector);
    if (existing != null) {
      existing.setAttribute('content', content);
    } else {
      final el = web.document.createElement('meta') as web.HTMLMetaElement;
      el.setAttribute('property', property);
      el.content = content;
      web.document.head?.appendChild(el);
    }
  }
}
