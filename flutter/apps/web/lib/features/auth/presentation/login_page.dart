import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/ui.dart' hide GradientButton;
import 'package:im_web/core/forms/form_controller.dart';
import 'package:im_web/core/forms/form_schema.dart';
import 'package:im_web/core/forms/validators.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';
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
          FormValidators.noWhitespace(loc.validationPasswordNoWhitespace),
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
      case AuthErrorCode.accountLocked:
        return loc.authAccountLocked;
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
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1200),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // 左侧品牌展示区
              Expanded(
                child: _buildBrandSection(loc, theme),
              ),
              const SizedBox(width: 80),
              // 右侧登录卡片
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: SingleChildScrollView(
                  child: AuthCard(
                    title: loc.loginTitle,
                    subtitle: loc.loginSubtitle,
                    child: _buildForm(loc),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBrandSection(AppLocalizations loc, ThemeData theme) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 品牌标识
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: const Color(0xFF07C160),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(
            Icons.chat_bubble_outline,
            color: Colors.white,
            size: 40,
          ),
        ),
        const SizedBox(height: 32),
        // 品牌标题
        Text(
          loc.brandTitle,
          style: theme.textTheme.headlineLarge?.copyWith(
            fontWeight: FontWeight.bold,
            color: theme.colorScheme.onSurface,
          ),
        ),
        const SizedBox(height: 16),
        // 品牌描述
        Text(
          loc.brandSubtitle,
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.6,
          ),
        ),
        const SizedBox(height: 48),
        // 功能特性
        _buildFeatureItem(
          icon: Icons.lock,
          title: loc.brandFeatureE2eeLabel,
          subtitle: loc.brandFeatureE2ee,
          theme: theme,
        ),
        const SizedBox(height: 24),
        _buildFeatureItem(
          icon: Icons.speed,
          title: loc.brandFeatureRealtimeLabel,
          subtitle: loc.brandFeatureRealtime,
          theme: theme,
        ),
        const SizedBox(height: 24),
        _buildFeatureItem(
          icon: Icons.devices,
          title: loc.brandFeatureDeviceTrustLabel,
          subtitle: loc.brandFeatureDeviceTrust,
          theme: theme,
        ),
      ],
    );
  }

  Widget _buildFeatureItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required ThemeData theme,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: theme.colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            icon,
            color: theme.colorScheme.primary,
            size: 24,
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: theme.colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ],
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
            textInputAction: TextInputAction.next,
          ),
          SizedBox(height: ImTokens.space4),
          ValidatedFormField(
            controller: _formController,
            name: 'password',
            label: loc.loginPassword,
            icon: Icons.lock_outline,
            obscureText: true,
            textInputAction: TextInputAction.done,
            onSubmitted: _login,
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
    final loc = AppLocalizations.of(context)!;
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildLangChip(loc.languageChinese, 'zh', currentLang),
          _buildLangChip(loc.languageEnglish, 'en', currentLang),
        ],
      ),
    );
  }

  Widget _buildLangChip(String label, String value, String currentLang) {
    final isSelected = currentLang == value;
    final theme = Theme.of(context);
    return Semantics(
      label: 'Switch to $label',
      button: true,
      selected: isSelected,
      child: InkWell(
        onTap: () {
          ref.read(languageProvider.notifier).state = value;
          getPlatformAdapter().setLocalStorage('app_language', value);
        },
        focusColor: theme.colorScheme.primary.withOpacity(0.1),
        highlightColor: theme.colorScheme.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(3),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected
                ? theme.colorScheme.surfaceContainerHighest
                : Colors.transparent,
            borderRadius: BorderRadius.circular(3),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: isSelected
                  ? theme.colorScheme.primary
                  : theme.colorScheme.onSurfaceVariant,
              fontSize: 13,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ),
    );
  }

  void _login() async {
    if (ref.read(authStateProvider).isLoading) return;
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
