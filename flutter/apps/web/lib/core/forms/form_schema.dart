typedef Validator = String? Function(String? value);

/// Combines multiple validators into one. Runs sequentially, stops at first error.
Validator composeValidators(List<Validator> validators) {
  return (String? value) {
    for (final validator in validators) {
      final error = validator(value);
      if (error != null) return error;
    }
    return null;
  };
}

class FormFieldSchema {
  final String name;
  final String type;
  final String? initialValue;
  final List<Validator> validators;
  final Future<Validator?> Function()? asyncValidatorFactory;

  const FormFieldSchema({
    required this.name,
    this.type = 'text',
    this.initialValue,
    this.validators = const [],
    this.asyncValidatorFactory,
  });
}

class FormSchema {
  final List<FormFieldSchema> fields;

  const FormSchema({required this.fields});
}
