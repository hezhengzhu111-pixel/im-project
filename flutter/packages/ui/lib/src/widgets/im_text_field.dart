import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// A text field component with built-in error display and decoration.
class ImTextField extends StatelessWidget {
  const ImTextField({
    super.key,
    this.label,
    this.hintText,
    this.errorText,
    this.controller,
    this.obscure = false,
    this.prefix,
    this.suffix,
    this.onChanged,
    this.maxLines = 1,
    this.enabled = true,
    this.autofocus = false,
    this.textInputAction,
    this.onSubmitted,
  });

  final String? label;
  final String? hintText;
  final String? errorText;
  final TextEditingController? controller;
  final bool obscure;
  final Widget? prefix;
  final Widget? suffix;
  final ValueChanged<String>? onChanged;
  final int maxLines;
  final bool enabled;
  final bool autofocus;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.brightness == Brightness.light ? ImColors.light : ImColors.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: TextStyle(
              fontSize: ImTokens.textSm,
              fontWeight: FontWeight.w500,
              color: colors.textPrimary,
            ),
          ),
          SizedBox(height: ImTokens.space1),
        ],
        TextFormField(
          controller: controller,
          obscureText: obscure,
          onChanged: onChanged,
          maxLines: maxLines,
          enabled: enabled,
          autofocus: autofocus,
          textInputAction: textInputAction,
          onFieldSubmitted: onSubmitted,
          decoration: InputDecoration(
            hintText: hintText,
            errorText: errorText,
            prefixIcon: prefix,
            suffixIcon: suffix,
          ),
        ),
      ],
    );
  }
}
