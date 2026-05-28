class ServerErrors {
  final Map<String, String> fieldErrors;
  final String? formError;

  const ServerErrors({
    this.fieldErrors = const {},
    this.formError,
  });
}

class ServerErrorMapper {
  static ServerErrors map(dynamic response, {Map<String, String>? fieldAlias}) {
    if (response == null || response is! Map<String, dynamic>) {
      return const ServerErrors();
    }

    final fieldErrors = <String, String>{};

    // Extract field errors from "errors" object
    final errors = response['errors'];
    if (errors != null && errors is Map<String, dynamic>) {
      for (final entry in errors.entries) {
        final key = fieldAlias != null && fieldAlias.containsKey(entry.key)
            ? fieldAlias[entry.key]!
            : entry.key;

        final value = entry.value;
        if (value is List && value.isNotEmpty) {
          fieldErrors[key] = value.first.toString();
        } else if (value != null) {
          fieldErrors[key] = value.toString();
        }
      }
    }

    // Extract form-level error
    String? formError;
    if (response.containsKey('message')) {
      formError = response['message']?.toString();
    } else if (response.containsKey('detail')) {
      formError = response['detail']?.toString();
    }

    return ServerErrors(
      fieldErrors: fieldErrors,
      formError: formError,
    );
  }
}
