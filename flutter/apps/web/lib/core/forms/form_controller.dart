import 'package:flutter/foundation.dart';
import 'package:im_web/core/forms/form_field_state.dart';
import 'package:im_web/core/forms/form_schema.dart';

class FormController extends ChangeNotifier {
  final FormSchema schema;
  final Map<String, FormFieldState> _fields = {};
  String? _formError;

  FormController(this.schema) {
    for (final fieldSchema in schema.fields) {
      _fields[fieldSchema.name] = FormFieldState(
        name: fieldSchema.name,
        initialValue: fieldSchema.initialValue,
      );
    }
  }

  FormFieldState field(String name) => _fields[name]!;
  String? get formError => _formError;
  Map<String, String> get values =>
      _fields.map((k, v) => MapEntry(k, v.value));

  Future<bool> validate() async {
    bool valid = true;
    for (final entry in _fields.entries) {
      await _validateSingleField(entry.key);
      if (!entry.value.isValid) valid = false;
    }
    return valid;
  }

  Future<void> validateField(String name) async {
    await _validateSingleField(name);
    notifyListeners();
  }

  void updateField(String name, String value) {
    final field = _fields[name]!;
    field.updateValue(value);
    if (field.touched) {
      _runSyncValidators(name);
    }
    notifyListeners();
  }

  void touchField(String name) {
    final field = _fields[name]!;
    if (!field.touched) {
      field.touch();
      _runSyncValidators(name);
      notifyListeners();
    }
  }

  void setFormError(String? error) {
    _formError = error;
    notifyListeners();
  }

  void clearFormError() {
    _formError = null;
    notifyListeners();
  }

  void applyServerErrors(Map<String, String> fieldErrors,
      {String? formError}) {
    for (final entry in fieldErrors.entries) {
      if (_fields.containsKey(entry.key)) {
        _fields[entry.key]!.setError(entry.value);
      }
    }
    _formError = formError;
    notifyListeners();
  }

  void reset() {
    for (final field in _fields.values) {
      field.reset();
    }
    _formError = null;
    notifyListeners();
  }

  Future<void> _validateSingleField(String name) async {
    final field = _fields[name]!;
    final fieldSchema =
        schema.fields.firstWhere((f) => f.name == name);

    _runSyncValidators(name);

    if (field.isValid && fieldSchema.asyncValidatorFactory != null) {
      field.setPending(true);
      notifyListeners();
      try {
        final asyncValidator = await fieldSchema.asyncValidatorFactory!();
        final error = asyncValidator?.call(field.value);
        field.setError(error);
      } finally {
        field.setPending(false);
        notifyListeners();
      }
    }
  }

  void _runSyncValidators(String name) {
    final field = _fields[name]!;
    final fieldSchema =
        schema.fields.firstWhere((f) => f.name == name);
    final composed = composeValidators(fieldSchema.validators);
    field.setError(composed(field.value));
  }
}
