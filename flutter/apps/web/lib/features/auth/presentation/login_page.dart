import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/ui.dart' hide GradientButton;
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';
import 'package:im_web/features/settings/presentation/settings_providers.dart';
import 'package:im_web/core/platform/platform_adapter.dart';
import 'package:im_web/widgets/validated_form.dart';
import 'package:im_web/widgets/validated_form_field.dart';
import 'package:im_web/features/auth/domain/auth_error_code.dart';
import 'auth_provider.dart';
import 'auth_providers.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage>
    with SingleTickerProviderStateMixin {
  late FormController _formController;
  Locale? _locale;
  bool _rememberMe = false;

  late AnimationController _animController;
  late Animation<double> _fadeAnim;
  late Animation<Offset> _slideAnim;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _fadeAnim = CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(0, 0.1),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _animController,
      curve: Curves.easeOut,
    ));
    _animController.forward();

    _formController = FormController(FormSchema(fields: []));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final locale = Localizations.localeOf(context);
    if (_locale != locale) {
      _locale = locale;
      _formController.dispose();
      _formController = _buildFormController();
    }
  }

  FormController _buildFormController() {
    final loc = AppLocalizations.of(context)!;
    return FormController(FormSchema(fields: [
      FormFieldSchema(
        name: 'username',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(3, loc.validationUsernameMinLength(3)),
          FormValidators.maxLength(20, loc.validationUsernameMaxLength(20)),
          FormValidators.pattern(
            RegExp(r'^[a-zA-Z0-9_]+$'),
            loc.validationUsernameInvalidChars,
          ),
        ],
      ),
      FormFieldSchema(
        name: 'password',
        validators: [
          FormValidators.required(loc.validationRequired),
          FormValidators.minLength(8, loc.validationPasswordMinLength(8)),
          FormValidators.maxLength(64, loc.validationPasswordMaxLength(64)),
          FormValidators.passwordStrength(loc.validationPasswordStrength),
        ],
      ),
    ]));
  }

  String _locErrorCode(AuthErrorCode code) {
    final loc = AppLocalizations.of(context)!;
    switch (code) {
      case AuthErrorCode.invalidCredentials:
        return loc.authInvalidCredentials;
      case AuthErrorCode.networkError:
        return loc.authNetworkError;
      case AuthErrorCode.serverError:
        return loc.authServerError;
      case AuthErrorCode.tooManyRequests:
        return loc.authTooManyRequests;
      case AuthErrorCode.unknown:
        return loc.authUnknownError;
    }
  }

  @override
  void dispose() {
    _formController.dispose();
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final glass = Theme.of(context).extension<GlassTheme>()!;

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (!mounted) return;
      if (next.errorCode != null) {
        _formController.setFormError(_locErrorCode(next.errorCode!));
      } else if (prev?.errorCode != null && next.errorCode == null) {
        _formController.setFormError(null);
      }
    });

    return Scaffold(
      body: GradientBackground(
        colors: glass.gradientColors,
        animated: true,
        child: Stack(
          children: [
            FadeTransition(
              opacity: _fadeAnim,
              child: SlideTransition(
                position: _slideAnim,
                child: context.isMobile
                    ? _buildMobileLayout(loc)
                    : _buildDesktopLayout(loc),
              ),
            ),
            // Language toggle button
            Positioned(
              top: 16,
              right: 16,
              child: _buildLanguageToggle(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMobileLayout(AppLocalizations loc) {
    return Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(ImTokens.space6),
        child: AuthCard(
          title: loc.loginTitle,
          subtitle: loc.loginSubtitle,
          child: _buildForm(loc),
        ),
      ),
    );
  }

  Widget _buildDesktopLayout(AppLocalizations loc) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Row(
            children: [
              // 左侧品牌展示区 — 限制最大宽度防止拉伸
              // 右侧登录卡片 — 固定宽度，居中对齐
              Expanded(
                flex: 4,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: AuthCard(
                        title: loc.loginTitle,
                        subtitle: loc.loginSubtitle,
                        child: _buildForm(loc),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildForm(AppLocalizations loc) {
    return ValidatedForm(
      controller: _formController,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ValidatedFormField(
            controller: _formController,
            name: 'username',
            label: loc.loginUsername,
            icon: Icons.person_outline,
          ),
          SizedBox(height: ImTokens.space4),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock_outline,
            obscureText: true,
          ),
          SizedBox(height: ImTokens.space3),
          Row(
            children: [
              Checkbox(
                value: _rememberMe,
                onChanged: (v) => setState(() => _rememberMe = v ?? false),
                activeColor: ImColors.light.primary,
              ),
              Text(loc.loginRememberMe),
            ],
          ),
          SizedBox(height: ImTokens.space4),
          GradientButton(
            text: loc.loginButton,
            isLoading: ref.watch(authStateProvider).isLoading,
            onPressed: _login,
          ),
          SizedBox(height: ImTokens.space4),
          Center(
            child: GestureDetector(
              onTap: () => context.go('/register'),
              child: Text(
                '${loc.loginNoAccount} ${loc.loginRegister}',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLanguageToggle() {
    final currentLang = ref.watch(languageProvider);
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLangChip('中文', 'zh', currentLang),
          _buildLangChip('English', 'en', currentLang),
        ],
      ),
    );
  }

  Widget _buildLangChip(String label, String value, String currentLang) {
    final isSelected = currentLang == value;
    return GestureDetector(
      onTap: () {
        ref.read(languageProvider.notifier).state = value;
        getPlatformAdapter().setLocalStorage('app_language', value);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? Theme.of(context).colorScheme.surfaceContainerHighest
              : Colors.transparent,
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.onSurfaceVariant,
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      ),
    );
  }

  void _login() async {
    final valid = await _formController.validate();
    if (!valid) return;

    final values = _formController.values;
    await ref.read(authStateProvider.notifier).login(
          values['username']!.trim(),
          values['password']!,
          rememberMe: _rememberMe,
        );
  }
}
