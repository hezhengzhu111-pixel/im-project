import React, { useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { colors, spacing } from '@/app/theme';
import { E2eeUnsupportedNotice } from '@/e2ee/E2eeUnsupportedNotice';
import { isEncryptedSession } from '@/e2ee/e2eeDeferred';
import { mediaService } from '@/services/media/mediaService';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';

export function ChatScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const currentUser = useAuthStore((state) => state.currentUser);
  const session = useSessionStore((state) => state.currentSession);
  const messagesBySession = useMessageStore((state) => state.messagesBySession);
  const retryMessage = useMessageStore((state) => state.retryMessage);
  const sendText = useChatStore((state) => state.sendText);
  const sendMedia = useChatStore((state) => state.sendMedia);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const messages = useMemo(() => (session ? messagesBySession[session.id] || [] : []), [messagesBySession, session]);
  const encrypted = isEncryptedSession(session);

  const submit = async () => {
    const content = text.trim();
    if (!content || encrypted) {
      return;
    }
    setText('');
    try {
      await sendText(content);
    } catch (error) {
      Alert.alert('Send failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const pickAndSend = async () => {
    try {
      const file = await mediaService.pickImage();
      if (file) {
        await sendMedia(file, file.type?.startsWith('video/') ? 'VIDEO' : 'IMAGE');
      }
    } catch (error) {
      Alert.alert('Media failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const takePhoto = async () => {
    try {
      const file = await mediaService.takePhoto();
      if (file) {
        await sendMedia(file, 'IMAGE');
      }
    } catch (error) {
      Alert.alert('Camera failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const pickFile = async () => {
    try {
      const file = await mediaService.pickDocument();
      if (file) {
        await sendMedia(file, 'FILE');
      }
    } catch (error) {
      Alert.alert('File failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const toggleVoiceRecording = async () => {
    try {
      if (recording) {
        const durationMs = recordingStartedAt ? Date.now() - recordingStartedAt : undefined;
        const file = await mediaService.stopVoiceRecording(durationMs);
        setRecording(false);
        setRecordingStartedAt(null);
        await sendMedia(file, 'VOICE');
        return;
      }
      await mediaService.startVoiceRecording();
      setRecording(true);
      setRecordingStartedAt(Date.now());
    } catch (error) {
      setRecording(false);
      setRecordingStartedAt(null);
      Alert.alert('Voice failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  if (!session) {
    return <Screen title="Chat"><EmptyState title="No active conversation" /></Screen>;
  }

  return (
    <Screen
      title={session.targetName}
      scroll={false}
      right={<Pressable onPress={() => navigation.navigate('SessionInfoScreen')}><Text>Info</Text></Pressable>}
    >
      <E2eeUnsupportedNotice visible={encrypted} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              mine={item.senderId === currentUser?.id}
              onRetry={() => {
                void retryMessage(item.id);
              }}
              onLongPress={() => Alert.alert('Message', item.content || item.mediaName || item.messageType)}
            />
          )}
        />
        <View style={styles.composer}>
          <Pressable disabled={encrypted} style={styles.tool} onPress={pickAndSend}><Text>+</Text></Pressable>
          <Pressable disabled={encrypted} style={styles.tool} onPress={takePhoto}><Text>Cam</Text></Pressable>
          <Pressable disabled={encrypted} style={styles.tool} onPress={pickFile}><Text>File</Text></Pressable>
          <Pressable disabled={encrypted} style={styles.tool} onPress={() => { void toggleVoiceRecording(); }}>
            <Text>{recording ? 'Stop' : 'Voice'}</Text>
          </Pressable>
          <TextInput
            editable={!encrypted}
            placeholder={encrypted ? 'E2EE not supported on mobile' : 'Message'}
            style={styles.input}
            value={text}
            onChangeText={setText}
          />
          <Pressable disabled={encrypted || !text.trim()} style={styles.send} onPress={submit}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg },
  composer: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  tool: { padding: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  send: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendText: { color: '#FFFFFF', fontWeight: '800' },
});
