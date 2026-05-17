import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';
import { E2eeUnsupportedMessage } from '@/e2ee/E2eeUnsupportedMessage';
import { isEncryptedMessage } from '@/e2ee/e2eeDeferred';
import { pendingMessageRepository } from '@/services/storage/pendingMessageRepository';
import { uploadTaskRepository } from '@/services/storage/uploadTaskRepository';
import { deriveSendStage } from '@/utils/sendStateMachine';
import type { MobileMessage, SendPipelineStage } from '@/types/models';
import { TextBubble } from './bubbles/TextBubble';
import { ImageBubble } from './bubbles/ImageBubble';
import { VideoBubble } from './bubbles/VideoBubble';
import { VoiceBubble } from './bubbles/VoiceBubble';
import { FileBubble } from './bubbles/FileBubble';
import { SystemBubble } from './bubbles/SystemBubble';
import { AiBubble } from './bubbles/AiBubble';
import { MessageStatusLine } from './bubbles/MessageStatusLine';

interface DerivedStatus {
  stage: SendPipelineStage;
  uploadProgress: number;
  localError?: string;
}

const getAvatarLetter = (message: MobileMessage, mine: boolean) =>
  (mine ? message.senderName || message.senderId : message.senderName || message.senderId || '?').slice(0, 1).toUpperCase();

const messageTypeFallback: Record<string, string> = {
  IMAGE: '图片',
  VIDEO: '视频',
  VOICE: '语音',
  FILE: '文件',
};

function BubbleAvatar({ message, mine }: { message: MobileMessage; mine: boolean }) {
  const avatar = message.senderAvatar;
  return (
    <View style={[styles.avatar, mine ? styles.mineAvatar : null]}>
      {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={[styles.avatarText, mine ? styles.mineAvatarText : null]}>{getAvatarLetter(message, mine)}</Text>}
    </View>
  );
}

export function MessageBubble({
  message,
  mine,
  onRetry,
  onLongPress,
}: {
  message: MobileMessage;
  mine: boolean;
  onRetry?: () => void;
  onLongPress?: () => void;
}) {
  const [tick, setTick] = React.useState(0);

  const computeDerived = React.useCallback((msg: MobileMessage): DerivedStatus => {
    const p = pendingMessageRepository.get(msg.id);
    const u = uploadTaskRepository.findByLocalMessageId(msg.id);
    const stage = deriveSendStage(p, u, msg);
    return {
      stage,
      uploadProgress: u?.progress ?? 0,
      localError: u?.lastError || p?.lastError || undefined,
    };
  }, []);

  const [derived, setDerived] = React.useState<DerivedStatus>(() => computeDerived(message));

  React.useEffect(() => {
    setDerived(computeDerived(message));
  }, [message, tick, computeDerived]);

  React.useEffect(() => {
    const terminalStages: SendPipelineStage[] = ['SENT', 'SEND_FAILED', 'UPLOAD_FAILED', 'BLOCKED', 'LOCAL_CREATED', 'UPLOAD_DONE'];
    if (terminalStages.includes(derived.stage)) return;
    const timer = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(timer);
  }, [derived.stage]);

  const showBlocked = derived.stage === 'BLOCKED';
  const showFailed = !showBlocked && (derived.stage === 'UPLOAD_FAILED' || derived.stage === 'SEND_FAILED' || message.status === 'FAILED');
  const mediaUri = message.mediaUrl || message.thumbnailUrl;

  const renderBubbleContent = () => {
    if (isEncryptedMessage(message)) return <E2eeUnsupportedMessage />;
    if (message.status === 'RECALLED') return <Text style={styles.recalledText}>{message.content || '消息已撤回'}</Text>;
    if (message.messageType === 'SYSTEM') return <SystemBubble message={message} mine={mine} />;
    if (message.messageType === 'AI_REPLY') return <AiBubble message={message} mine={mine} />;

    const mediaElement =
      message.messageType === 'IMAGE' && mediaUri ? <ImageBubble message={message} mine={mine} />
      : message.messageType === 'VIDEO' && mediaUri ? <VideoBubble message={message} mine={mine} />
      : message.messageType === 'VOICE' && mediaUri ? <VoiceBubble message={message} mine={mine} />
      : message.messageType === 'FILE' && mediaUri ? <FileBubble message={message} mine={mine} />
      : null;

    if (mediaElement) {
      return mediaElement;
    }
    if (message.messageType === 'TEXT') {
      return <TextBubble message={message} mine={mine} />;
    }
    const fallbackContent =
      message.content ||
      message.mediaName ||
      message.mediaUrl ||
      messageTypeFallback[message.messageType] ||
      message.messageType ||
      '消息';
    return <Text style={[styles.fallbackText, mine ? styles.mineFallbackText : null]}>{fallbackContent}</Text>;
  };

  if (message.status === 'DELETED') return null;

  const compactMedia = message.messageType === 'IMAGE' || message.messageType === 'VIDEO';
  const recalled = message.status === 'RECALLED';
  const encrypted = isEncryptedMessage(message);

  return (
    <View style={[styles.messageRow, mine ? styles.mineRow : null]}>
      {!mine ? <BubbleAvatar message={message} mine={mine} /> : null}
      <Pressable style={[styles.contentWrap, mine ? styles.mineContentWrap : null, compactMedia ? styles.mediaContentWrap : null]} onLongPress={onLongPress}>
        {!mine && message.groupId ? <Text style={styles.sender}>{message.senderName || message.senderId}</Text> : null}
        <View style={[styles.bubble, mine ? styles.mineBubble : null, compactMedia ? styles.mediaBubble : null, recalled || encrypted ? styles.neutralBubble : null]}>
          {renderBubbleContent()}
        </View>
        {showFailed ? (
          <Pressable onPress={onRetry}>
            <Text style={[styles.failed, mine ? styles.mineStatusText : null]}>{derived.localError || '发送失败，点按重试'}</Text>
          </Pressable>
        ) : showBlocked ? (
          <Text style={[styles.failed, mine ? styles.mineStatusText : null]}>已阻止发送</Text>
        ) : (
          <MessageStatusLine sendTime={message.sendTime} mine={mine} stage={derived.stage} messageStatus={message.status} uploadProgress={derived.uploadProgress} />
        )}
      </Pressable>
      {mine ? <BubbleAvatar message={message} mine={mine} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  mineRow: {
    justifyContent: 'flex-end',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 34,
  },
  mineAvatar: {
    backgroundColor: colors.primary,
  },
  avatarImage: {
    height: 34,
    width: 34,
  },
  avatarText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '900',
  },
  mineAvatarText: {
    color: '#FFFFFF',
  },
  contentWrap: {
    alignItems: 'flex-start',
    maxWidth: '76%',
  },
  mineContentWrap: {
    alignItems: 'flex-end',
  },
  mediaContentWrap: {
    maxWidth: '78%',
  },
  sender: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginBottom: spacing.xs,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius?.lg ?? 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mineBubble: {
    backgroundColor: colors.primary,
  },
  mediaBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  neutralBubble: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  failed: {
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  mineStatusText: {
    textAlign: 'right',
  },
  recalledText: {
    color: colors.muted,
    fontSize: typography.small,
  },
  fallbackText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 21,
  },
  mineFallbackText: {
    color: '#FFFFFF',
  },
});
