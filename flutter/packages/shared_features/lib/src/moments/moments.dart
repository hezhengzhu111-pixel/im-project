/// Moments (朋友圈) module shared between desktop and mobile applications.
library;

// Data layer
export 'data/moments_api.dart';
export 'data/moments_repository.dart';

// Presentation layer
export 'presentation/moments_providers.dart';
export 'presentation/moments_main_page.dart';
export 'presentation/feed/moments_feed_page.dart';
export 'presentation/composer/moments_composer_page.dart';
export 'presentation/feed/moments_feed_provider.dart';
export 'presentation/feed/moments_interactions_provider.dart';
export 'presentation/composer/composer_provider.dart';
export 'presentation/notifications/notifications_provider.dart';
export 'presentation/notifications/moments_notifications_page.dart';
