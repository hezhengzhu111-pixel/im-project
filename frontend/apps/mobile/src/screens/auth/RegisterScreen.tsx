import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { colors, radius, spacing, typography } from '@/app/theme';
import { useAuthStore } from '@/stores/authStore';

const REGISTER_BG = '#F5F5F5';
const REGISTER_CARD = '#FFFFFF';
const REGISTER_TEXT = '#333333';
const REGISTER_MUTED = '#999999';
const REGISTER_BORDER = '#E5E7EB';
const REGISTER_GREEN = '#07C160';
const REGISTER_GREEN_ACTIVE = '#06AD56';
const REGISTER_LINK = '#576B95';
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]+$/;

type RegisterInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  returnKeyType?: 'done' | 'next';
  onSubmitEditing?: () => void;
};

function RegisterInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  returnKeyType = 'next',
  onSubmitEditing,
}: RegisterInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={REGISTER_MUTED}
      returnKeyType={returnKeyType}
      secureTextEntry={secureTextEntry}
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
    />
  );
}

function CheckBox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.checkbox} onPress={onPress}>
      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
    </Pressable>
  );
}

function InfoModal({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={styles.modalBody}>{children}</ScrollView>
          <Pressable accessibilityRole="button" style={styles.modalButton} onPress={onClose}>
            <Text style={styles.modalButtonText}>关闭</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function RegisterScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const register = useAuthStore((state) => state.register);
  const loading = useAuthStore((state) => state.loading);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreement, setAgreement] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const validate = () => {
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    if (!trimmedUsername) return '请输入用户名';
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) return '用户名长度在 3 到 20 个字符';
    if (!USERNAME_PATTERN.test(trimmedUsername)) return '用户名只能包含字母、数字和下划线';
    if (!trimmedEmail) return '请输入邮箱';
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) return '请输入正确的邮箱格式';
    if (!password) return '请输入密码';
    if (password.length < 8 || password.length > 64) return '密码长度在 8 到 64 个字符';
    if (!PASSWORD_PATTERN.test(password)) return '密码必须包含字母和数字';
    if (confirmPassword !== password) return '两次输入密码不一致';
    if (!agreement) return '请阅读并同意用户协议和隐私政策';
    return '';
  };

  const submit = async () => {
    if (loading) return;
    const message = validate();
    if (message) {
      Alert.alert('注册失败', message);
      return;
    }

    try {
      const ok = await register({
        username: username.trim(),
        nickname: username.trim(),
        email: email.trim(),
        password,
      });
      if (ok) {
        Alert.alert('注册成功', '请登录您的加密通信账户', [
          { text: '立即登录', onPress: () => navigation.navigate('LoginScreen') },
        ]);
      }
    } catch (error) {
      Alert.alert('注册失败', error instanceof Error ? error.message : '请稍后重试');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>IM聊天应用</Text>
              <Text style={styles.subtitle}>创建您的账户，开始聊天之旅</Text>
            </View>

            <View style={styles.form}>
              <RegisterInput value={username} onChangeText={setUsername} placeholder="请输入用户名" />
              <RegisterInput value={email} onChangeText={setEmail} placeholder="请输入邮箱" keyboardType="email-address" />
              <RegisterInput value={password} onChangeText={setPassword} placeholder="请输入密码" secureTextEntry />
              <RegisterInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="请确认密码"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={submit}
              />

              <View style={styles.agreementRow}>
                <CheckBox checked={agreement} onPress={() => setAgreement((value) => !value)} />
                <Text style={styles.agreementText}>我已阅读并同意</Text>
                <Pressable accessibilityRole="button" onPress={() => setShowAgreement(true)}>
                  <Text style={styles.agreementLink}>用户协议</Text>
                </Pressable>
                <Text style={styles.agreementText}>和</Text>
                <Pressable accessibilityRole="button" onPress={() => setShowPrivacy(true)}>
                  <Text style={styles.agreementLink}>隐私政策</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={loading}
                style={({ pressed }) => [
                  styles.registerButton,
                  pressed && !loading ? styles.registerButtonPressed : null,
                  loading ? styles.registerButtonDisabled : null,
                ]}
                onPress={submit}
              >
                <Text style={styles.registerButtonText}>{loading ? '注册中...' : '注册'}</Text>
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>已有账户？</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate('LoginScreen')}>
                <Text style={styles.footerLink}>立即登录</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoModal visible={showAgreement} title="用户协议" onClose={() => setShowAgreement(false)}>
        <Text style={styles.modalHeading}>1. 服务条款</Text>
        <Text style={styles.modalParagraph}>欢迎使用IM聊天应用。在使用本服务前，请仔细阅读并理解本协议的所有条款。</Text>
        <Text style={styles.modalHeading}>2. 用户责任</Text>
        <Text style={styles.modalParagraph}>用户应当遵守相关法律法规，不得利用本服务从事违法违规活动。</Text>
        <Text style={styles.modalHeading}>3. 隐私保护</Text>
        <Text style={styles.modalParagraph}>我们重视用户隐私，将按照隐私政策保护用户个人信息。</Text>
        <Text style={styles.modalHeading}>4. 服务变更</Text>
        <Text style={styles.modalParagraph}>我们保留随时修改或终止服务的权利，恕不另行通知。</Text>
      </InfoModal>

      <InfoModal visible={showPrivacy} title="隐私政策" onClose={() => setShowPrivacy(false)}>
        <Text style={styles.modalHeading}>1. 信息收集</Text>
        <Text style={styles.modalParagraph}>我们仅收集为提供服务所必需的用户信息。</Text>
        <Text style={styles.modalHeading}>2. 信息使用</Text>
        <Text style={styles.modalParagraph}>收集的信息仅用于提供和改善服务，不会用于其他目的。</Text>
        <Text style={styles.modalHeading}>3. 信息保护</Text>
        <Text style={styles.modalParagraph}>我们采用行业标准的安全措施保护用户信息安全。</Text>
        <Text style={styles.modalHeading}>4. 信息共享</Text>
        <Text style={styles.modalParagraph}>除法律要求外，我们不会与第三方共享用户个人信息。</Text>
      </InfoModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: REGISTER_BG,
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  card: {
    alignSelf: 'center',
    backgroundColor: REGISTER_CARD,
    borderRadius: radius.sm,
    elevation: 3,
    maxWidth: 420,
    padding: 40,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    color: REGISTER_TEXT,
    fontSize: 24,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: REGISTER_MUTED,
    fontSize: typography.body,
    textAlign: 'center',
  },
  form: {
    gap: spacing.lg,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: REGISTER_BORDER,
    borderRadius: radius.md,
    borderWidth: 1,
    color: REGISTER_TEXT,
    fontSize: typography.body,
    height: 44,
    paddingHorizontal: spacing.lg,
  },
  agreementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCDCDC',
    borderRadius: 2,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    width: 14,
  },
  checkboxMark: {
    color: REGISTER_GREEN,
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  agreementText: {
    color: '#666666',
    fontSize: typography.small,
  },
  agreementLink: {
    color: '#409EFF',
    fontSize: typography.small,
    fontWeight: '600',
  },
  registerButton: {
    alignItems: 'center',
    backgroundColor: REGISTER_GREEN,
    borderRadius: radius.sm,
    height: 40,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  registerButtonPressed: {
    backgroundColor: REGISTER_GREEN_ACTIVE,
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: REGISTER_MUTED,
    fontSize: typography.body,
  },
  footerLink: {
    color: REGISTER_LINK,
    fontSize: typography.body,
    fontWeight: '600',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    maxHeight: '78%',
    maxWidth: 600,
    padding: spacing.xl,
    width: '100%',
  },
  modalTitle: {
    color: REGISTER_TEXT,
    fontSize: typography.subtitle,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  modalBody: {
    marginBottom: spacing.lg,
  },
  modalHeading: {
    color: REGISTER_TEXT,
    fontSize: typography.body,
    fontWeight: '800',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  modalParagraph: {
    color: '#666666',
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  modalButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    borderColor: REGISTER_BORDER,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modalButtonText: {
    color: REGISTER_TEXT,
    fontSize: typography.body,
    fontWeight: '600',
  },
});
