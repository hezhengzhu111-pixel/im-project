import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '@/app/theme';
import { useAuthStore } from '@/stores/authStore';

const AUTH_PRIMARY = '#635BFF';
const AUTH_PRIMARY_2 = '#7C3AED';
const AUTH_BG = '#F4F6FF';
const AUTH_SURFACE = 'rgba(255,255,255,0.92)';
const AUTH_BORDER = '#E5E7F0';
const AUTH_TEXT = '#111827';
const AUTH_MUTED = '#8A94A6';
const AUTH_SUCCESS = '#18A058';
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

type AuthInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  returnKeyType?: 'done' | 'next';
  onSubmitEditing?: () => void;
};

function AuthInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  returnKeyType = 'next',
  onSubmitEditing,
}: AuthInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={secureTextEntry ? 'password' : 'username'}
      clearButtonMode="while-editing"
      placeholder={placeholder}
      placeholderTextColor={AUTH_MUTED}
      returnKeyType={returnKeyType}
      secureTextEntry={secureTextEntry}
      style={styles.input}
      textContentType={secureTextEntry ? 'password' : 'username'}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
    />
  );
}

function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Text style={styles.featureIconText}>{icon}</Text>
      </View>
      <View style={styles.featureTextWrap}>
        <Text numberOfLines={1} style={styles.featureLabel}>{title}</Text>
        <Text numberOfLines={1} style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function CheckBox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.checkboxRow} onPress={onPress}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const tiny = height < 690;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const validate = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      return '请填写用户名和密码';
    }
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return '用户名长度在 3 到 20 个字符';
    }
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return '用户名只能包含字母、数字和下划线';
    }
    return '';
  };

  const submit = async () => {
    if (loading) return;
    const message = validate();
    if (message) {
      Alert.alert('登录失败', message);
      return;
    }

    try {
      await login({ username: username.trim(), password });
    } catch (error) {
      Alert.alert('登录失败', error instanceof Error ? error.message : '请稍后重试');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.scrollContent, compact ? styles.scrollContentCompact : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View pointerEvents="none" style={styles.backgroundLayer}>
            <View style={styles.decorCircleOne} />
            <View style={styles.decorCircleTwo} />
            <View style={styles.decorCircleThree} />
          </View>

          <View style={[styles.hero, compact ? styles.heroCompact : null]}>
            <View style={styles.brandBadge}>
              <Text style={styles.brandBadgeIcon}>□</Text>
              <Text style={styles.brandBadgeText}>End-to-End Encrypted</Text>
            </View>
            <Text style={[styles.brandTitle, compact ? styles.brandTitleCompact : null]}>
              {'Secure.\nPrivate.\nInstant.'}
            </Text>
            <Text style={[styles.brandSubtitle, compact ? styles.brandSubtitleCompact : null]}>
              端对端加密即时通信系统，您的消息仅在设备上解密。
            </Text>

            {tiny ? (
              <View style={styles.trustStrip}>
                <Text style={styles.trustStripText}>E2EE · Realtime · Device Trust · AI</Text>
              </View>
            ) : (
              <View style={styles.featuresGrid}>
                <FeatureItem icon="L" title="E2EE Enabled" description="端对端加密" />
                <FeatureItem icon="~" title="Realtime Delivery" description="实时消息同步" />
                <FeatureItem icon="◇" title="Device Trust" description="多设备安全登录" />
                <FeatureItem icon="AI" title="AI Assistant Online" description="AI 助手接入" />
              </View>
            )}
          </View>

          <View style={[styles.card, compact ? styles.cardCompact : null]}>
            <View style={[styles.cardHeader, compact ? styles.cardHeaderCompact : null]}>
              <Text style={styles.cardTitle}>欢迎回来</Text>
              <Text style={styles.cardSubtitle}>请登录您的加密通信账户</Text>
            </View>

            <View style={styles.form}>
              <AuthInput value={username} onChangeText={setUsername} placeholder="请输入用户名" />
              <AuthInput
                value={password}
                onChangeText={setPassword}
                placeholder="请输入密码"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={submit}
              />

              <CheckBox checked={rememberMe} label="记住我" onPress={() => setRememberMe((value) => !value)} />

              <Pressable
                accessibilityRole="button"
                disabled={loading}
                style={({ pressed }) => [
                  styles.loginButton,
                  pressed && !loading ? styles.loginButtonPressed : null,
                  loading ? styles.loginButtonDisabled : null,
                ]}
                onPress={submit}
              >
                <Text style={styles.loginButtonText}>{loading ? '登录中...' : '登录'}</Text>
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>还没有账户？</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate('RegisterScreen')}>
                <Text style={styles.footerLink}>立即注册</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: AUTH_BG,
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  scrollContentCompact: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  backgroundLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  decorCircleOne: {
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 150,
    height: 300,
    position: 'absolute',
    right: -118,
    top: -82,
    width: 300,
  },
  decorCircleTwo: {
    backgroundColor: 'rgba(139,92,246,0.06)',
    borderRadius: 120,
    bottom: -78,
    height: 240,
    left: -110,
    position: 'absolute',
    width: 240,
  },
  decorCircleThree: {
    backgroundColor: 'rgba(34,197,94,0.05)',
    borderRadius: 86,
    height: 172,
    position: 'absolute',
    right: 26,
    top: 244,
    width: 172,
  },
  hero: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  heroCompact: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  brandBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: AUTH_SURFACE,
    borderColor: AUTH_BORDER,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  brandBadgeIcon: {
    color: AUTH_SUCCESS,
    fontSize: typography.small,
    fontWeight: '900',
  },
  brandBadgeText: {
    color: AUTH_SUCCESS,
    fontSize: typography.small,
    fontWeight: '800',
  },
  brandTitle: {
    color: AUTH_TEXT,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 39,
  },
  brandTitleCompact: {
    fontSize: 30,
    lineHeight: 34,
  },
  brandSubtitle: {
    color: '#667085',
    fontSize: typography.body,
    lineHeight: 21,
  },
  brandSubtitleCompact: {
    fontSize: typography.small,
    lineHeight: 18,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  featureItem: {
    alignItems: 'center',
    backgroundColor: AUTH_SURFACE,
    borderColor: AUTH_BORDER,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: '48.5%',
  },
  featureIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF0FF',
    borderRadius: radius.md,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  featureIconText: {
    color: AUTH_PRIMARY,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  featureTextWrap: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  featureLabel: {
    color: AUTH_TEXT,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  featureDescription: {
    color: AUTH_MUTED,
    fontSize: 10,
    fontWeight: '600',
  },
  trustStrip: {
    backgroundColor: AUTH_SURFACE,
    borderColor: AUTH_BORDER,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  trustStripText: {
    color: AUTH_PRIMARY,
    fontSize: typography.tiny,
    fontWeight: '900',
    textAlign: 'center',
  },
  card: {
    backgroundColor: AUTH_SURFACE,
    borderColor: AUTH_BORDER,
    borderRadius: 28,
    borderWidth: 1,
    elevation: 10,
    padding: spacing.xxl,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    width: '100%',
  },
  cardCompact: {
    borderRadius: 24,
    padding: spacing.xl,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  cardHeaderCompact: {
    marginBottom: spacing.xl,
  },
  cardTitle: {
    color: AUTH_TEXT,
    fontSize: typography.title,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    color: AUTH_MUTED,
    fontSize: typography.body,
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: AUTH_BORDER,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: AUTH_TEXT,
    fontSize: typography.body,
    height: 48,
    paddingHorizontal: spacing.lg,
  },
  checkboxRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DDE8',
    borderRadius: 3,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    width: 14,
  },
  checkboxChecked: {
    backgroundColor: AUTH_PRIMARY,
    borderColor: AUTH_PRIMARY,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  checkboxLabel: {
    color: '#667085',
    fontSize: typography.small,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: AUTH_PRIMARY,
    borderRadius: radius.lg,
    elevation: 4,
    height: 48,
    justifyContent: 'center',
    shadowColor: AUTH_PRIMARY_2,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  loginButtonPressed: {
    transform: [{ translateY: 1 }],
  },
  loginButtonDisabled: {
    opacity: 0.75,
  },
  loginButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: AUTH_MUTED,
    fontSize: typography.small,
  },
  footerLink: {
    color: AUTH_PRIMARY,
    fontSize: typography.small,
    fontWeight: '800',
  },
});
