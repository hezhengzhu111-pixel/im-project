import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useAuthStore } from '@/stores/authStore';

export function RegisterScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const register = useAuthStore((state) => state.register);
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      const ok = await register({ username, nickname, email, phone, password });
      if (ok) {
        navigation.navigate('LoginScreen');
      }
    } catch (error) {
      Alert.alert('Register failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  return (
    <Screen title="Register">
      <TextField label="Username" value={username} onChangeText={setUsername} />
      <TextField label="Nickname" value={nickname} onChangeText={setNickname} />
      <TextField label="Email" value={email} onChangeText={setEmail} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} />
      <TextField label="Password" value={password} secureTextEntry onChangeText={setPassword} />
      <PrimaryButton disabled={!username || !password} label="Register" onPress={submit} />
      <PrimaryButton label="Back to login" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
