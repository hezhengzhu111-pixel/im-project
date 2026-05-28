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

// 用户协议内容
const String userAgreementContent = '''
1. 服务条款
欢迎使用IM聊天应用。在使用本服务前，请仔细阅读并理解本协议的所有条款。

2. 用户责任
用户应当遵守相关法律法规，不得利用本服务从事违法违规活动。

3. 隐私保护
我们重视用户隐私，将按照隐私政策保护用户个人信息。

4. 服务变更
我们保留随时修改或终止服务的权利，恕不另行通知。
''';

// 隐私政策内容
const String privacyPolicyContent = '''
1. 信息收集
我们仅收集为提供服务所必需的用户信息。

2. 信息使用
收集的信息仅用于提供和改善服务，不会用于其他目的。

3. 信息保护
我们采用行业标准的安全措施保护用户信息安全。

4. 信息共享
除法律要求外，我们不会与第三方共享用户个人信息。
''';
