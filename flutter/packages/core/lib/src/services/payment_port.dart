import 'models.dart';

/// Abstract port for payment processing services.
///
/// Implementations should handle platform-specific payment flows
/// (e.g., Stripe, IAP, Google Play Billing).
abstract class PaymentPort {
  /// Initiate a purchase.
  /// Returns PaymentResult with success status and transaction ID.
  Future<PaymentResult> purchase(PaymentRequest request);

  /// Get purchase history for the current user.
  Future<List<PurchaseHistory>> getPurchaseHistory();
}

/// Noop implementation that always fails with "not available".
class NoopPaymentPort implements PaymentPort {
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
