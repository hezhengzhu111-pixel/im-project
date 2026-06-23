import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class AgreementDialog extends StatelessWidget {
  final String title;
  final String content;

  const AgreementDialog({
    super.key,
    required this.title,
    required this.content,
  });

  static void show(BuildContext context, String title, String content) {
    showDialog(
      context: context,
      builder: (context) => AgreementDialog(title: title, content: content),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Text(content),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(AppLocalizations.of(context)!.commonClose),
        ),
      ],
    );
  }
}
