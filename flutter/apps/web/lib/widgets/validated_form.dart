import 'package:flutter/material.dart';
import 'package:im_web/core/forms/form_controller.dart';

class ValidatedForm extends StatefulWidget {
  final FormController controller;
  final Widget child;

  const ValidatedForm({
    super.key,
    required this.controller,
    required this.child,
  });

  static FormController of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<_ValidatedFormInherited>()!.controller;
  }

  @override
  State<ValidatedForm> createState() => _ValidatedFormState();
}

class _ValidatedFormState extends State<ValidatedForm> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
  }

  @override
  void didUpdateWidget(covariant ValidatedForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_onControllerChanged);
      widget.controller.addListener(_onControllerChanged);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return _ValidatedFormInherited(
      controller: widget.controller,
      child: widget.child,
    );
  }
}

class _ValidatedFormInherited extends InheritedWidget {
  final FormController controller;

  const _ValidatedFormInherited({
    required this.controller,
    required super.child,
  });

  @override
  bool updateShouldNotify(_ValidatedFormInherited oldWidget) {
    return true;
  }
}
