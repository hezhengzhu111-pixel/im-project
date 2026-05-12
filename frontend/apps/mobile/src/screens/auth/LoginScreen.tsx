import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { spacing } from '@/app/theme';
import { useAuthStore } from '@/stores/authStore';

export function LoginScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      await login({ username, password });
    } catch (error) {
      Alert.alert('Login failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  return (
    <Screen title="IM Mobile">
      <Text style={styles.copy}>Android-first native client</Text>
      <TextField label="Username" value={username} onChangeText={setUsername} />
      <TextField label="Password" value={password} secureTextEntry onChangeText={setPassword} />
      <PrimaryButton disabled={loading || !username || !password} label={loading ? 'Signing in...' : 'Login'} onPress={submit} />
      <PrimaryButton label="Create account" onPress={() => navigation.navigate('RegisterScreen')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: {
    margin: spacing.lg,
  },
});
