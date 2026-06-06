import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/src/chat/chat.dart';

void main() {
  late MessagePipeline pipeline;

  setUp(() {
    pipeline = MessagePipeline();
  });

  group('MessagePipeline', () {
    test('should accept new message id', () {
      final isNew = pipeline.shouldProcess('msg_1');
      expect(isNew, true);
    });

    test('should detect duplicate message id', () {
      pipeline.shouldProcess('msg_1');
      final isDuplicate = pipeline.shouldProcess('msg_1');
      expect(isDuplicate, false);
    });

    test('should accept different message ids', () {
      pipeline.shouldProcess('msg_1');
      pipeline.shouldProcess('msg_2');
      final isNew = pipeline.shouldProcess('msg_3');
      expect(isNew, true);
    });

    test('should clear pipeline and accept previously seen ids', () {
      pipeline.shouldProcess('msg_1');
      pipeline.clear();
      final isNew = pipeline.shouldProcess('msg_1');
      expect(isNew, true);
    });

    test('should accept message after pipeline is cleared', () {
      pipeline.shouldProcess('msg_1');
      pipeline.shouldProcess('msg_2');
      pipeline.clear();
      expect(pipeline.shouldProcess('msg_1'), true);
      expect(pipeline.shouldProcess('msg_2'), true);
    });

    test('should handle empty message id', () {
      final isNew = pipeline.shouldProcess('');
      expect(isNew, true);
    });

    test('should detect duplicate empty message id', () {
      pipeline.shouldProcess('');
      final isDuplicate = pipeline.shouldProcess('');
      expect(isDuplicate, false);
    });
  });
}
