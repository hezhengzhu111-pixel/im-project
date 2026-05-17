import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type ParamListBase, type RouteProp } from '@react-navigation/native';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { showMessageActionSheet, type MessageActionCallbacks } from '@/components/chat/MessageActionSheet';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import { colors, spacing, typography } from '@/app/theme';
import type { ChatStackParamList } from '@/app/navigation/ChatNavigator';
import { E2eeUnsupportedNotice } from '@/e2ee/E2eeUnsupportedNotice';
import { isEncryptedSession } from '@/e2ee/e2eeDeferred';
import { mediaService } from '@/services/media/mediaService';
import { mediaSaveService } from '@/services/media/mediaSaveService';
import { platformClipboard } from '@/services/platform/clipboard';
import { platformLinking } from '@/services/platform/linking';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';
import { deriveSendStage } from '@/utils/sendStateMachine';
import type { MessageActionContext, MobileMessage } from '@/types/models';

const BOTTOM_THRESHOLD = 120;
const ON_END_REACHED_THRESHOLD = 3;

export function ChatScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const route = useRoute<RouteProp<ChatStackParamList, 'ChatScreen'>>();
  const authReady = useAuthStore((state) => state.authReady);
  const currentUser = useAuthStore((state) => state.currentUser);
  const session = useSessionStore((state) => state.currentSession);
  const messagesBySession = useMessageStore((state) => state.messagesBySession);
  const messagesPaginationBySession = useMessageStore((state) => state.messagesPaginationBySession);
  const loadInitialMessages = useMessageStore((state) => state.loadInitialMessages);
  const loadOlderMessages = useMessageStore((state) => state.loadOlderMessages);
  const retryMessage = useMessageStore((state) => state.retryMessage);
  const openSessionFromRoute = useChatStore((state) => state.openSessionFromRoute);
  const sendText = useChatStore((state) => state.sendText);
  const sendMedia = useChatStore((state) => state.sendMedia);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [showNewMessages, setShowNewMessages] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  const isLoadingOlderRef = useRef(false);
  const prevMessageCountRef = useRef(0);

  const messages = useMemo(() => (session ? messagesBySession[session.id] || [] : []), [messagesBySession, session]);
  const pagination = useMemo(
    () => (session ? messagesPaginationBySession[session.id] : undefined),
    [messagesPaginationBySession, session],
  );
  const encrypted = isEncryptedSession(session);
  const routeParams = route.params;
  const routeKey = useMemo(() => JSON.stringify(routeParams || {}), [routeParams]);
  const hasTargetRouteParams = Boolean(
    routeParams?.conversationId ||
      routeParams?.sessionId ||
      routeParams?.senderId ||
      routeParams?.receiverId ||
      routeParams?.groupId ||
      routeParams?.targetId,
  );

  useEffect(() => {
    if (!routeParams || !hasTargetRouteParams || !authReady || !currentUser?.id) {
      return;
    }
    void openSessionFromRoute(routeParams).catch((error: unknown) => {
      Alert.alert('Open chat failed', error instanceof Error ? error.message : 'Please try again');
    });
  }, [authReady, currentUser?.id, hasTargetRouteParams, openSessionFromRoute, routeKey, routeParams]);

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadInitialMessages(session);
  }, [session, loadInitialMessages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (pagination?.initialized && prevMessageCountRef.current === 0 && messages.length > 0) {
      requestAnimationFrame(() => {
        try {
          flatListRef.current?.scrollToEnd({ animated: false });
        } catch {
          // FlatList may not be ready in test environments
        }
      });
    }
    prevMessageCountRef.current = messages.length;
  }, [pagination?.initialized, messages.length]);

  // Track new messages when user is not at bottom
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && !isAtBottomRef.current && prevMessageCountRef.current > 0) {
      setShowNewMessages(true);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      isAtBottomRef.current = distanceFromBottom < BOTTOM_THRESHOLD;
      if (isAtBottomRef.current) {
        setShowNewMessages(false);
      }
    },
    [],
  );

  const loadOlder = useCallback(() => {
    if (!session || isLoadingOlderRef.current || !pagination?.initialized) {
      return;
    }
    if (pagination && !pagination.hasMoreBefore) {
      return;
    }
    isLoadingOlderRef.current = true;
    void loadOlderMessages(session).finally(() => {
      isLoadingOlderRef.current = false;
    });
  }, [session, pagination, loadOlderMessages]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToEnd({ animated: true });
      } catch {
        // FlatList may not be ready in test environments
      }
    });
    setShowNewMessages(false);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (isAtBottomRef.current && !isLoadingOlderRef.current) {
      requestAnimationFrame(() => {
        try {
          flatListRef.current?.scrollToEnd({ animated: false });
        } catch {
          // FlatList may not be ready in test environments
        }
      });
    }
  }, []);

  const submit = async () => {
    const content = text.trim();
    if (!content || encrypted) {
      return;
    }
    setText('');
    try {
      await sendText(content);
      scrollToBottom();
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

  const buildActionContext = useCallback(
    (message: MobileMessage): MessageActionContext => {
      const p = pendingMessageRepository.get(message.id);
      const u = uploadTaskRepository.findByLocalMessageId(message.id);
      const stage = deriveSendStage(p, u, message);
      const mediaUri = message.mediaUrl || message.thumbnailUrl || '';
      const hasMediaUri = mediaUri.length > 0 && !mediaUri.startsWith('http://') && !mediaUri.startsWith('https://');
      const hasRemoteMediaUri = mediaUri.length > 0 && (mediaUri.startsWith('http://') || mediaUri.startsWith('https://'));
      return {
        currentUserId: currentUser?.id || '',
        isGroupSession: session?.type === 'group',
        now: Date.now(),
        recallWindowMs: 120_000,
        sendStage: stage,
        messageStatus: message.status,
        hasMediaUri,
        hasRemoteMediaUri,
      };
    },
    [currentUser?.id, session?.type],
  );

  const actionCallbacks = useMemo<MessageActionCallbacks>(() => ({
    onCopy: (message: MobileMessage) => {
      platformClipboard.copyText(message.content || '');
    },
    onRetry: (message: MobileMessage) => {
      void retryMessage(message.id, { force: true });
    },
    onDeleteLocal: (message: MobileMessage) => {
      const sid = session?.id;
      if (sid) {
        useMessageStore.getState().deleteLocalMessage(sid, message.id);
      }
    },
    onRecall: (message: MobileMessage) => {
      const sid = session?.id;
      if (sid) {
        useMessageStore.getState().recallMessage(sid, message).catch((error: unknown) => {
          Alert.alert('撤回失败', error instanceof Error ? error.message : '请稍后重试');
        });
      }
    },
    onSaveMedia: (message: MobileMessage) => {
      const uri = message.mediaUrl || message.thumbnailUrl || '';
      const promise =
        message.messageType === 'VIDEO'
          ? mediaSaveService.saveVideo(uri)
          : mediaSaveService.saveImage(uri);
      promise.catch((error: unknown) => {
        Alert.alert('保存失败', error instanceof Error ? error.message : '暂不支持保存到相册');
      });
    },
    onOpenFile: (message: MobileMessage) => {
      const uri = message.mediaUrl || '';
      const openPromise =
        uri.startsWith('http://') || uri.startsWith('https://')
          ? platformLinking.openUrl(uri)
          : platformLinking.openFile(uri.replace('file://', ''), message.extra?.mimeType as string | undefined);
      openPromise.catch((error: unknown) => {
        Alert.alert('打开失败', error instanceof Error ? error.message : '无法打开文件');
      });
    },
    onReadDetail: (_message: MobileMessage) => {
      Alert.alert('消息详情', 'Read detail not implemented');
    },
  }), [retryMessage, session?.id]);

  const handleMessageLongPress = useCallback(
    (message: MobileMessage) => {
      const ctx = buildActionContext(message);
      showMessageActionSheet(message, ctx, actionCallbacks);
    },
    [buildActionContext, actionCallbacks],
  );

  const renderHeader = () => {
    if (pagination?.loadingOlder) {
      return (
        <View style={styles.headerStatus}>
          <LoadingState label="Loading history..." />
        </View>
      );
    }
    if (pagination && !pagination.hasMoreBefore && messages.length > 0) {
      return (
        <View style={styles.headerStatus}>
          <Text style={styles.noMoreText}>No more history</Text>
        </View>
      );
    }
    return null;
  };

  if (!session) {
    if (hasTargetRouteParams) {
      return <Screen title="Chat"><LoadingState label="Opening conversation..." /></Screen>;
    }
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
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              mine={item.senderId === currentUser?.id}
              onRetry={() => {
                void retryMessage(item.id, { force: true });
              }}
              onLongPress={() => handleMessageLongPress(item)}
            />
          )}
          ListHeaderComponent={renderHeader}
          onEndReached={loadOlder}
          onEndReachedThreshold={ON_END_REACHED_THRESHOLD}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={handleContentSizeChange}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />
        {showNewMessages ? (
          <Pressable style={styles.newMessagesButton} onPress={scrollToBottom}>
            <Text style={styles.newMessagesText}>New messages</Text>
          </Pressable>
        ) : null}
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
  headerStatus: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  noMoreText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  newMessagesButton: {
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  newMessagesText: {
    color: '#FFFFFF',
    fontSize: typography.small,
    fontWeight: '700',
  },
});
