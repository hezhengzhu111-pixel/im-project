import React from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { spacing } from '@/app/theme';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';

export function SessionInfoScreen() {
  const session = useSessionStore((state) => state.currentSession);
  const updateSessionFlags = useSessionStore((state) => state.updateSessionFlags);
  const clearMessages = useMessageStore((state) => state.clearMessages);

  if (!session) {
    return <Screen title="Session Info"><Text>No session</Text></Screen>;
  }

  return (
    <Screen title="Session Info">
      <Text style={styles.title}>{session.targetName}</Text>
      <Text>ID: {session.targetId}</Text>
      <Pressable onPress={() => updateSessionFlags(session.id, { isPinned: !session.isPinned })}>
        <Text>Pin: {session.isPinned ? 'On' : 'Off'}</Text>
      </Pressable>
      <Pressable onPress={() => updateSessionFlags(session.id, { isMuted: !session.isMuted })}>
        <Text>Mute: {session.isMuted ? 'On' : 'Off'}</Text>
      </Pressable>
      <PrimaryButton
        label="Clear history"
        onPress={() => {
          clearMessages(session.id);
          Alert.alert('History cleared');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: '800',
    margin: spacing.lg,
  },
});
