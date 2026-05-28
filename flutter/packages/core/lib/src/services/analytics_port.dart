/// Abstract port for analytics/tracking services.
///
/// Implementations should send events to analytics providers
/// (e.g., Firebase Analytics, Mixpanel, Amplitude).
/// All methods must be safe to call from any thread.
abstract class AnalyticsPort {
  /// Track a named event with optional properties.
  /// Properties must NOT contain PII (tokens, emails, phone numbers).
  void trackEvent(String eventName, [Map<String, dynamic>? properties]);

  /// Set the current user ID for event attribution.
  /// Pass null to clear the user ID (e.g., on logout).
  void setUserId(String? userId);

  /// Set user properties for segmentation.
  /// Properties must NOT contain PII.
  void setUserProperties(Map<String, dynamic> properties);
}

/// Noop implementation that discards all events.
/// Use in tests and local development.
class NoopAnalyticsPort implements AnalyticsPort {
  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {}

  @override
  void setUserId(String? userId) {}

  @override
  void setUserProperties(Map<String, dynamic> properties) {}
}
