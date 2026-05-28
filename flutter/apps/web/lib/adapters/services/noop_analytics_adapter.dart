import 'package:im_core/core.dart';

/// Web adapter for analytics. Currently Noop.
/// Replace with real SDK (e.g., Firebase Analytics) when ready.
class NoopAnalyticsAdapter implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
