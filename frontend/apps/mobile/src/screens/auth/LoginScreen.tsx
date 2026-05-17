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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { BrandLockup } from '@/components/brand/BrandIdentity';
import { radius, spacing, typography } from '@/app/theme';
import { useAuthStore } from '@/stores/authStore';

const BG = '#F7FAF8';
const CARD = '#FFFFFF';
const TEXT = '#111827';
const MUTED = '#8A94A6';
const BORDER = '#EEF0F4';
const PRIMARY = '#07C160';
const PRIMARY_ACTIVE = '#06AD56';
const LINK = '#576B95';
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
      placeholderTextColor={MUTED}
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

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const validate = () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) return '请填写用户名和密码';
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) return '用户名长度在 3 到 20 个字符';
    if (!USERNAME_PATTERN.test(trimmedUsername)) return '用户名只能包含字母、数字和下划线';
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
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.main}>
            <View style={styles.brand}>
              <BrandLockup compact animated />
              <Text style={styles.brandProof}>端到端加密 · 安全私密 · 只为抵达的人可见</Text>
            </View>

            <View style={styles.formCard}>
              <AuthInput value={username} onChangeText={setUsername} placeholder="请输入用户名" />
              <View style={styles.separator} />
              <AuthInput
                value={password}
                onChangeText={setPassword}
                placeholder="请输入密码"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !loading ? styles.primaryButtonPressed : null,
                loading ? styles.primaryButtonDisabled : null,
              ]}
              onPress={submit}
            >
              <Text style={styles.primaryButtonText}>{loading ? '登录中...' : '进入密笺'}</Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>还没有账号？</Text>
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('RegisterScreen')}>
              <Text style={styles.footerLink}>注册</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: BG,
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: 68,
  },
  main: {
    width: '100%',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 42,
  },
  brandProof: {
    color: MUTED,
    fontSize: typography.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: CARD,
    borderColor: 'rgba(87, 107, 149, 0.08)',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    backgroundColor: CARD,
    color: TEXT,
    fontSize: typography.body,
    height: 56,
    paddingHorizontal: spacing.lg,
  },
  separator: {
    backgroundColor: BORDER,
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: PRIMARY,
    borderRadius: radius.lg,
    height: 50,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  primaryButtonPressed: {
    backgroundColor: PRIMARY_ACTIVE,
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  footerText: {
    color: MUTED,
    fontSize: typography.small,
  },
  footerLink: {
    color: LINK,
    fontSize: typography.small,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
});