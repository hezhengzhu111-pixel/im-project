/// Chat module shared between desktop and mobile applications.
library;

// Data layer
export 'data/message_api.dart';
export 'data/message_api_provider.dart';
export 'data/message_pipeline.dart';
export 'data/message_config.dart';
export 'data/file_api.dart';
export 'data/file_providers.dart';

// Shared utilities (pure logic, no platform dependencies)
export 'data/outbox_port.dart';
export 'data/session_key_codec.dart';
export 'data/e2ee_history_recovery.dart';
export 'data/read_receipt_handler.dart';
export 'data/retryable_error_classifier.dart';
export 'data/outbox_message_id.dart';
export 'data/message_merge_utils.dart';
export 'data/sent_message_cache_port.dart';
export 'data/sent_message_cache_provider.dart';

// Presentation layer
export 'presentation/chat_state.dart';
export 'presentation/chat_provider.dart';
export 'presentation/chat_providers.dart';
export 'presentation/chat_notifier.dart';
export 'presentation/chat_page.dart';
export 'presentation/widgets/message_bubble.dart';
export 'presentation/widgets/message_input.dart';
export 'presentation/widgets/session_tile.dart';
