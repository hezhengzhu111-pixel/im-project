import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/app/theme';
import { formatMessageTime } from '@/utils/time';
import type { SendPipelineStage } from '@/types/models';

interface Props {
  sendTime: string;
  mine: boolean;
  stage: SendPipelineStage;
  messageStatus?: string;
  uploadProgress?: number;
}

function statusLabel(
  mine: boolean,
  stage: SendPipelineStage,
  messageStatus?: string,
  uploadProgress?: number,
): string {
  if (!mine) return '';

  switch (stage) {
    case 'SEND_PENDING':
    case 'SENDING':
      return '发送中';
    case 'UPLOAD_PENDING':
      return '准备上传';
    case 'UPLOADING':
      return `上传中 ${uploadProgress ?? 0}%`;
    case 'SENT': {
      if (messageStatus === 'READ') return '已读';
      if (messageStatus === 'DELIVERED') return '已送达';
      return '已发送';
    }
    default:
      return '';
  }
}

export function MessageStatusLine({ sendTime, mine, stage, messageStatus, uploadProgress }: Props) {
  const time = formatMessageTime(sendTime);
  const label = statusLabel(mine, stage, messageStatus, uploadProgress);

  return (
    <View style={[styles.row, mine && styles.mineRow]}>
      {label ? <Text style={styles.status}>{label}</Text> : null}
      {time ? <Text style={styles.time}>{time}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  mineRow: {
    justifyContent: 'flex-end',
  },
  status: {
    color: colors.muted,
    fontSize: typography.tiny,
    marginRight: spacing.xs,
  },
  time: {
    color: colors.muted,
    fontSize: typography.tiny,
  },
});
