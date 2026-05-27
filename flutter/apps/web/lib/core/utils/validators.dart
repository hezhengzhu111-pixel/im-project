class Validators {
  static String? validateUsername(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入用户名';
    }
    if (value.length < 3 || value.length > 20) {
      return '用户名长度在 3 到 20 个字符';
    }
    if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(value)) {
      return '用户名只能包含字母、数字和下划线';
    }
    return null;
  }

  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入邮箱';
    }
    if (!RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(value)) {
      return '请输入正确的邮箱格式';
    }
    return null;
  }

  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入密码';
    }
    if (value.length < 8 || value.length > 64) {
      return '密码长度在 8 到 64 个字符';
    }
    if (!RegExp(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$').hasMatch(value)) {
      return '密码必须包含字母和数字';
    }
    return null;
  }

  static String? validateConfirmPassword(String? value, String password) {
    if (value == null || value.isEmpty) {
      return '请确认密码';
    }
    if (value != password) {
      return '两次输入密码不一致';
    }
    return null;
  }
}
