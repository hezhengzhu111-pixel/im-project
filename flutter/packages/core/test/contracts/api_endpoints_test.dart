import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('ApiEndpoints', () {
    test('AuthEndpoints paths are correct', () {
      expect(AuthEndpoints.parse, '/auth/parse');
      expect(AuthEndpoints.refresh, '/auth/refresh');
      expect(AuthEndpoints.wsTicket, '/auth/ws-ticket');
    });

    test('MessageEndpoints parameterized paths work', () {
      expect(MessageEndpoints.privateHistory('123'), '/message/private/123');
      expect(MessageEndpoints.markRead('conv1'), '/message/read/conv1');
    });

    test('WsMessageType constants are correct', () {
      expect(WsMessageType.message, 'MESSAGE');
      expect(WsMessageType.e2eeNegotiation, 'E2EE_NEGOTIATION');
    });
  });
}
