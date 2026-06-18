import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/chat.dart';

void main() {
  group('MessagePipeline', () {
    test('accepts a new message id once', () {
      final pipeline = MessagePipeline();

      expect(pipeline.shouldProcess('msg-1'), isTrue);
      expect(pipeline.shouldProcess('msg-1'), isFalse);
      expect(pipeline.shouldProcess('msg-2'), isTrue);
    });

    test('clear allows a seen message id again', () {
      final pipeline = MessagePipeline();

      expect(pipeline.shouldProcess('msg-1'), isTrue);
      pipeline.clear();

      expect(pipeline.shouldProcess('msg-1'), isTrue);
    });

    test('evicts oldest ids when max size is exceeded', () {
      final pipeline = MessagePipeline();

      for (var index = 0; index <= 1000; index += 1) {
        expect(pipeline.shouldProcess('msg-$index'), isTrue);
      }

      expect(pipeline.shouldProcess('msg-0'), isTrue);
      expect(pipeline.shouldProcess('msg-1000'), isFalse);
    });
  });
}
