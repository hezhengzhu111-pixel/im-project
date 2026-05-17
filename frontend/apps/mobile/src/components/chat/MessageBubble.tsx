import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
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

  // Poll while in any non-terminal send stage to refresh derived status
  React.useEffect(() => {
    const terminalStages: SendPipelineStage[] = ['SENT', 'SEND_FAILED', 'UPLOAD_FAILED', 'BLOCKED', 'LOCAL_CREATED', 'UPLOAD_DONE'];
    if (terminalStages.includes(derived.stage)) return;
    const timer = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(timer);
  }, [derived.stage]);

  if (isEncryptedMessage(message)) {
    return (
      <View style={[styles.wrap, mine && styles.mineWrap]}>
        <E2eeUnsupportedMessage />
      </View>
    );
  }

  if (message.status === 'RECALLED') {
    return (
      <View style={[styles.wrap, mine && styles.mineWrap]}>
        <View style={[styles.bubble, styles.recalledBubble]}>
          <Text style={styles.recalledText}>{message.content || '消息已撤回'}</Text>
        </View>
        <MessageStatusLine
          sendTime={message.sendTime}
          mine={mine}
          stage={derived.stage}
          messageStatus={message.status}
        />
      </View>
    );
  }

  if (message.status === 'DELETED') {
    return null;
  }

  const showBlocked = derived.stage === 'BLOCKED';
  const showFailed =
    !showBlocked &&
    (derived.stage === 'UPLOAD_FAILED' || derived.stage === 'SEND_FAILED' || message.status === 'FAILED');

  const mediaUri = message.mediaUrl || message.thumbnailUrl;

  const renderBubbleContent = () => {
    if (message.messageType === 'SYSTEM') {
      return <SystemBubble message={message} mine={mine} />;
    }
    if (message.messageType === 'AI_REPLY') {
      return <AiBubble message={message} mine={mine} />;
    }

    const mediaElement =
      message.messageType === 'IMAGE' && mediaUri ? <ImageBubble message={message} mine={mine} />
      : message.messageType === 'VIDEO' && mediaUri ? <VideoBubble message={message} mine={mine} />
      : message.messageType === 'VOICE' && mediaUri ? <VoiceBubble message={message} mine={mine} />
      : message.messageType === 'FILE' && mediaUri ? <FileBubble message={message} mine={mine} />
      : null;

    if (mediaElement) {
      return (
        <>
          {mediaElement}
          <TextBubble message={message} mine={mine} />
        </>
      );
    }

    return <TextBubble message={message} mine={mine} />;
  };

  return (
    <Pressable style={[styles.wrap, mine && styles.mineWrap]} onLongPress={onLongPress}>
      {!mine && message.groupId ? <Text style={styles.sender}>{message.senderName || message.senderId}</Text> : null}
      <View style={[styles.bubble, mine && styles.mineBubble]}>
        {renderBubbleContent()}
      </View>
      {showFailed ? (
        <Pressable onPress={onRetry}>
          <Text style={styles.failed}>
            {derived.localError || 'Failed. Tap to retry.'}
          </Text>
        </Pressable>
      ) : showBlocked ? (
        <Text style={styles.failed}>Blocked</Text>
      ) : (
        <MessageStatusLine
          sendTime={message.sendTime}
          mine={mine}
          stage={derived.stage}
          messageStatus={message.status}
          uploadProgress={derived.uploadProgress}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
    maxWidth: '82%',
  },
  mineWrap: {
    alignSelf: 'flex-end',
  },
  sender: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginBottom: spacing.xs,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
  },
  mineBubble: {
    backgroundColor: colors.primary,
  },
  failed: {
    color: colors.danger,
    fontSize: typography.tiny,
    marginTop: spacing.xs,
  },
  recalledBubble: {
    backgroundColor: colors.surfaceAlt,
  },
  recalledText: {
    color: colors.muted,
    fontSize: typography.small,
    fontStyle: 'italic',
  },
});
