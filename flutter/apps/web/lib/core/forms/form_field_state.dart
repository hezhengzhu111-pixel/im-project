import 'package:flutter/foundation.dart';

class FormFieldState extends ChangeNotifier {
  final String name;
  final String? _initialValue;
  String _value;
  String? _error;
  bool _touched = false;
  bool _dirty = false;
  bool _pending = false;

  FormFieldState({
    required this.name,
    String? initialValue,
  })  : _initialValue = initialValue,
        _value = initialValue ?? '';

  String get value => _value;
  String? get error => _error;
  bool get touched => _touched;
  bool get dirty => _dirty;
  bool get pending => _pending;
  bool get isValid => _error == null;
  bool get hasValue => _value.isNotEmpty;

  void updateValue(String value) {
    if (_value == value) return;
    _value = value;
    _dirty = true;
    notifyListeners();
  }

  void setError(String? error) {
    _error = error;
    notifyListeners();
  }

  void touch() {
    _touched = true;
    notifyListeners();
  }

  void setPending(bool pending) {
    _pending = pending;
    notifyListeners();
  }

  void reset() {
    _value = _initialValue ?? '';
    _error = null;
    _touched = false;
    _dirty = false;
    _pending = false;
    notifyListeners();
  }
}
