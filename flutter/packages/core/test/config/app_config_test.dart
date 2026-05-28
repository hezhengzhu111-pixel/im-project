import 'package:test/test.dart';
import 'package:im_core/src/config/app_config.dart';

void main() {
  test('AppConfig defaults to all disabled', () {
    const config = AppConfig();
    expect(config.analyticsEnabled, false);
    expect(config.errorReporterEnabled, false);
    expect(config.paymentEnabled, false);
    expect(config.mapEnabled, false);
    expect(config.pushEnabled, false);
    expect(config.filePreviewEnabled, false);
  });

  test('AppConfig can be constructed with specific flags', () {
    const config = AppConfig(
      analyticsEnabled: true,
      pushEnabled: true,
    );
    expect(config.analyticsEnabled, true);
    expect(config.pushEnabled, true);
    expect(config.errorReporterEnabled, false);
  });
}
