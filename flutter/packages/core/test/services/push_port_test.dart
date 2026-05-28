import 'dart:async';
import 'package:test/test.dart';
import 'package:im_core/src/services/push_port.dart';
import 'package:im_core/src/services/models.dart';

class _TestPushAdapter implements PushPort {
  final _controller = StreamController<PushMessage>.broadcast();
  bool subscribeCalled = false;
  bool unsubscribeCalled = false;

  @override
  Future<String?> subscribe() async {
    subscribeCalled = true;
    return 'test_token';
  }

  @override
  Future<void> unsubscribe() async {
    unsubscribeCalled = true;
  }

  @override
  Stream<PushMessage> get onMessage => _controller.stream;

  void dispose() => _controller.close();
}

void main() {
  test('PushPort interface can be implemented', () async {
    final adapter = _TestPushAdapter();
    final token = await adapter.subscribe();
    expect(token, 'test_token');
    expect(adapter.subscribeCalled, true);

    await adapter.unsubscribe();
    expect(adapter.unsubscribeCalled, true);

    adapter.dispose();
  });

  test('PushPort onMessage streams messages', () async {
    final adapter = _TestPushAdapter();
    final messages = <PushMessage>[];
    adapter.onMessage.listen(messages.add);

    adapter._controller.add(const PushMessage(
      title: 'Test',
      body: 'Hello',
    ));

    await Future.delayed(Duration.zero);
    expect(messages.length, 1);
    expect(messages[0].title, 'Test');

    adapter.dispose();
  });
}
