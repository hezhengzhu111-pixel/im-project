import 'package:im_core/core.dart';

/// Web adapter for payments. Currently Noop.
/// Replace with Stripe or other payment SDK when ready.
class NoopPaymentAdapter implements PaymentPort {
  @override
  Future<PaymentResult> purchase(PaymentRequest request) async {
    return const PaymentResult(
      success: false,
      error: 'Payment not available in this environment',
    );
  }

  @override
  Future<List<PurchaseHistory>> getPurchaseHistory() async => [];
}
