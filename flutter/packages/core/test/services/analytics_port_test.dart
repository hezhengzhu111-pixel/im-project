import 'package:test/test.dart';
import 'package:im_core/src/services/analytics_port.dart';

class _TestAnalyticsAdapter implements AnalyticsPort {
  final List<AnalyticsCall> calls = [];

  @override
  void trackEvent(String eventName, [Map<String, dynamic>? properties]) {
    calls.add(AnalyticsCall('trackEvent', eventName, properties));
  }

  @override
  void setUserId(String? userId) {
    calls.add(AnalyticsCall('setUserId', userId, null));
  }

  @override
  void setUserProperties(Map<String, dynamic> properties) {
    calls.add(AnalyticsCall('setUserProperties', null, properties));
  }
}

class AnalyticsCall {
  final String method;
  final String? eventName;
  final Map<String, dynamic>? properties;
  AnalyticsCall(this.method, this.eventName, this.properties);
}

void main() {
  test('AnalyticsPort interface can be implemented', () {
    final adapter = _TestAnalyticsAdapter();
    adapter.trackEvent('test_event', {'key': 'value'});
    adapter.setUserId('user_123');
    adapter.setUserProperties({'plan': 'premium'});

    expect(adapter.calls.length, 3);
    expect(adapter.calls[0].method, 'trackEvent');
    expect(adapter.calls[0].eventName, 'test_event');
    expect(adapter.calls[1].method, 'setUserId');
    expect(adapter.calls[1].eventName, 'user_123');
    expect(adapter.calls[2].method, 'setUserProperties');
  });
}
