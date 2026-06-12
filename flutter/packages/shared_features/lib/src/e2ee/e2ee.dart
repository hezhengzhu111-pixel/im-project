/// E2EE (End-to-End Encryption) feature barrel export.
///
export 'package:im_core_flutter/im_core_flutter.dart' show e2eeAdapterProvider;

/// Data layer
export 'data/e2ee_api.dart';
export 'data/e2ee_key_store.dart';
export 'data/e2ee_manager.dart';
export 'data/e2ee_meta_store.dart';
export 'data/e2ee_providers.dart';
export 'data/e2ee_session_store.dart';

/// Presentation layer
export 'presentation/e2ee_provider.dart';
export 'presentation/encryption_badge.dart';
export 'presentation/encryption_banner.dart';
export 'presentation/negotiation_dialog.dart';
