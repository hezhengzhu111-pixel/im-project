import 'package:flutter_riverpod/flutter_riverpod.dart';

class ErrorState {
  const ErrorState({this.message, this.timestamp});
  final String? message;
  final DateTime? timestamp;
}

class ErrorNotifier extends StateNotifier<ErrorState> {
  ErrorNotifier() : super(const ErrorState());

  void showError(String message) {
    state = ErrorState(message: message, timestamp: DateTime.now());
  }

  void clear() {
    state = const ErrorState();
  }
}
