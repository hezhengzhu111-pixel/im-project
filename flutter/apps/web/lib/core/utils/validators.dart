import 'package:im_web/l10n/app_localizations.dart';

class Validators {
  static String? validateUsername(String? value, AppLocalizations loc) {
    if (value == null || value.isEmpty) {
      return loc.validatorUsernameRequired;
    }
    if (value.length < 3 || value.length > 20) {
      return loc.validatorUsernameLength;
    }
    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(value)) {
      return loc.validatorUsernameFormat;
    }
    return null;
  }

  static String? validateEmail(String? value, AppLocalizations loc) {
    if (value == null || value.isEmpty) {
      return loc.validatorEmailRequired;
    }
    if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
      return loc.validatorEmailFormat;
    }
    return null;
  }

  static String? validatePassword(String? value, AppLocalizations loc) {
    if (value == null || value.isEmpty) {
      return loc.validatorPasswordRequired;
    }
    if (value.length < 8 || value.length > 64) {
      return loc.validatorPasswordLength;
    }
    if (!RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$').hasMatch(value)) {
      return loc.validatorPasswordFormat;
    }
    return null;
  }

  static String? validateConfirmPassword(String? value, String password, AppLocalizations loc) {
    if (value == null || value.isEmpty) {
      return loc.validatorConfirmPasswordRequired;
    }
    if (value != password) {
      return loc.validatorPasswordMismatch;
    }
    return null;
  }
}
