/// Compile-time configuration for third-party service enablement.
///
/// Configure via --dart-define at build time:
///   flutter run --dart-define=ANALYTICS_ENABLED=true
class AppConfig {
  final bool analyticsEnabled;
  final bool errorReporterEnabled;
  final bool paymentEnabled;
  final bool mapEnabled;
  final bool pushEnabled;
  final bool filePreviewEnabled;

  const AppConfig({
    this.analyticsEnabled = false,
    this.errorReporterEnabled = false,
    this.paymentEnabled = false,
    this.mapEnabled = false,
    this.pushEnabled = false,
    this.filePreviewEnabled = false,
  });

  /// Read configuration from compile-time environment variables.
  static AppConfig fromEnvironment() {
    return AppConfig(
      analyticsEnabled: const bool.fromEnvironment('ANALYTICS_ENABLED'),
      errorReporterEnabled:
          const bool.fromEnvironment('ERROR_REPORTER_ENABLED'),
      paymentEnabled: const bool.fromEnvironment('PAYMENT_ENABLED'),
      mapEnabled: const bool.fromEnvironment('MAP_ENABLED'),
      pushEnabled: const bool.fromEnvironment('PUSH_ENABLED'),
      filePreviewEnabled: const bool.fromEnvironment('FILE_PREVIEW_ENABLED'),
    );
  }
}
