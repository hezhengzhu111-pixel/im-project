import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

class ValidatedFormField extends StatefulWidget {
  final FormController controller;
  final String name;
  final String label;
  final IconData? icon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final int maxLines;

  const ValidatedFormField({
    super.key,
    required this.controller,
    required this.name,
    required this.label,
    this.icon,
    this.obscureText = false,
    this.keyboardType,
    this.maxLines = 1,
  });

  @override
  State<ValidatedFormField> createState() => _ValidatedFormFieldState();
}

class _ValidatedFormFieldState extends State<ValidatedFormField> {
  bool _obscured = true;
  late Listenable _listenable;

  @override
  void initState() {
    super.initState();
    _obscured = widget.obscureText;
    _listenable = Listenable.merge([
      widget.controller,
      widget.controller.field(widget.name),
    ]);
  }

  @override
  void didUpdateWidget(covariant ValidatedFormField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller ||
        oldWidget.name != widget.name) {
      _listenable = Listenable.merge([
        widget.controller,
        widget.controller.field(widget.name),
      ]);
    }
  }

  @override
  Widget build(BuildContext context) {
    final field = widget.controller.field(widget.name);

    return ListenableBuilder(
      listenable: _listenable,
      builder: (context, _) {
        return TextFormField(
          initialValue: field.value,
          obscureText: widget.obscureText ? _obscured : false,
          keyboardType: widget.keyboardType,
          maxLines: widget.obscureText ? 1 : widget.maxLines,
          decoration: InputDecoration(
            labelText: widget.label,
            prefixIcon: widget.icon != null ? Icon(widget.icon) : null,
            suffixIcon: _buildSuffix(field),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            errorText:
                field.touched && field.error != null ? field.error : null,
          ),
          onChanged: (value) {
            widget.controller.updateField(widget.name, value);
          },
          onEditingComplete: () {
            widget.controller.touchField(widget.name);
            widget.controller.validateField(widget.name);
            Focus.of(context).nextFocus();
          },
          onFieldSubmitted: (_) {
            widget.controller.touchField(widget.name);
            widget.controller.validateField(widget.name);
          },
        );
      },
    );
  }

  Widget? _buildSuffix(dynamic field) {
    if (field.pending) {
      return const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (widget.obscureText) {
      return IconButton(
        icon: Icon(_obscured ? Icons.visibility_off : Icons.visibility),
        onPressed: () => setState(() => _obscured = !_obscured),
      );
    }
    return null;
  }
}
