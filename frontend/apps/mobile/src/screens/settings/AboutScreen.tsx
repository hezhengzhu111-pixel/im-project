import React from 'react';
import { Text } from 'react-native';
import { Screen } from '@/components/common/Screen';

export function AboutScreen() {
  return (
    <Screen title="About">
      <Text>@im/mobile Bare React Native Android-first client</Text>
      <Text>iOS structure exists but Android is the validation target for this phase.</Text>
    </Screen>
  );
}
