import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/form_field_state.dart';

export 'package:im_web/core/forms/form_schema.dart' show composeValidators;

class FormValidators {
  static Validator required(String message) {
    return (value) {
      if (value == null || value.trim().isEmpty) return message;
      return null;
    };
  }

  static Validator minLength(int min, String message) {
    return (value) {
      if (value != null && value.length < min) return message;
      return null;
    };
  }

  static Validator maxLength(int max, String message) {
    return (value) {
      if (value != null && value.length > max) return message;
      return null;
    };
  }

  static Validator pattern(RegExp regex, String message) {
    return (value) {
      if (value != null && !regex.hasMatch(value)) return message;
      return null;
    };
  }

  static Validator email(String message) {
    return pattern(RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$'), message);
  }

  static Validator passwordStrength(String message) {
    return pattern(
      RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$'),
      message,
    );
  }

  static Validator sameAs(FormFieldState other, String message) {
    return (value) {
      if (value != other.value) return message;
      return null;
    };
  }

  static Future<Validator?> asyncUniqueUsername(String message) async {
    // Placeholder: in production, call backend API
    return null;
  }
}
