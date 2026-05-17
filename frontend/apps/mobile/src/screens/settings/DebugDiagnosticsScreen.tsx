import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import {
  debugDiagnosticsService,
  type DebugDiagnosticsSnapshot,
} from '@/services/debug/debugDiagnosticsService';
import { logger } from '@/utils/logger';
import { colors, spacing, typography } from '@/app/theme';

const formatTime = (value?: number) => {
  if (!value) {
    return '未记录';
  }
  return new Date(value).toLocaleString('zh-CN');
};

const formatValue = (value: string | number | boolean) => {
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  const textMap: Record<string, string> = {
    dev: '开发',
    development: '开发',
    sit: '测试',
    production: '生产',
    connected: '已连接',
    connecting: '连接中',
    disconnected: '未连接',
    reconnecting: '重连中',
    deferred: '暂缓支持',
    full: '完整支持',
    'receive-only': '仅接收',
    memory: '内存',
    sqlite: '本地数据库',
    idle: '空闲',
    running: '运行中',
    success: '成功',
    failed: '失败',
    unknown: '未知',
  };
  if (typeof value === 'string' && textMap[value.toLowerCase()]) {
    return textMap[value.toLowerCase()];
  }
  return String(value);
};

const InfoRow = ({ label, value }: { label: string; value: string | number | boolean }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{formatValue(value)}</Text>
  </View>
);

export function DebugDiagnosticsScreen() {
  const [snapshot, setSnapshot] = useState<DebugDiagnosticsSnapshot>(() => debugDiagnosticsService.getSnapshot());

  useEffect(() => {
    const refresh = () => {
      setSnapshot(debugDiagnosticsService.getSnapshot());
    };
    refresh();
    const interval = setInterval(refresh, 1500);
    const unsubscribe = logger.subscribe(() => {
      refresh();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const recentErrorText = useMemo(
    () =>
      snapshot.recentErrors.length === 0
        ? '暂无警告或错误'
        : snapshot.recentErrors
            .map((entry) => `${new Date(entry.createdAt).toLocaleTimeString('zh-CN')} ${entry.level.toUpperCase()} ${entry.scope}: ${entry.message}`)
            .join('\n'),
    [snapshot.recentErrors],
  );

  const confirmClearLocalCache = () => {
    Alert.alert('清理本地缓存？', '将保留登录状态，但会移除本地缓存、待发送数据、上传任务和最近诊断记录。', [
      { text: '取消', style: 'cancel' },
      {
        text: '继续',
        onPress: () => {
          Alert.alert('确认清理', '此操作无法撤销。现在清理本地缓存吗？', [
            { text: '取消', style: 'cancel' },
            {
              text: '清理',
              style: 'destructive',
              onPress: () => {
                debugDiagnosticsService.clearLocalCache();
                setSnapshot(debugDiagnosticsService.getSnapshot());
                Alert.alert('本地缓存已清理');
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <Screen
      title="调试诊断"
      onRefresh={() => {
        setSnapshot(debugDiagnosticsService.getSnapshot());
      }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>运行环境</Text>
        <InfoRow label="应用环境" value={snapshot.appEnv} />
        <InfoRow label="接口地址" value={snapshot.apiBaseUrl} />
        <InfoRow label="长连接地址" value={snapshot.wsBaseUrl} />
        <InfoRow label="当前用户标识" value={snapshot.currentUserId || '未登录'} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>实时状态</Text>
        <InfoRow label="长连接状态" value={snapshot.websocketStatus} />
        <InfoRow label="重连次数" value={snapshot.reconnectAttempts} />
        <InfoRow label="存储模式" value={snapshot.storageMode} />
        <InfoRow label="持久化可用" value={snapshot.persistenceAvailable} />
        <InfoRow label="当前结构版本" value={snapshot.schemaVersion ?? '未记录'} />
        <InfoRow label="目标结构版本" value={snapshot.targetSchemaVersion} />
        <InfoRow label="迁移状态" value={snapshot.migrationStatus} />
        {snapshot.lastMigrationError ? (
          <InfoRow label="迁移错误" value={snapshot.lastMigrationError} />
        ) : null}
        <InfoRow label="会话数量" value={snapshot.sessionCount} />
        <InfoRow label="消息数量" value={snapshot.messageCount} />
        <InfoRow label="待发送数量" value={snapshot.pendingCount} />
        <InfoRow label="上传任务数量" value={snapshot.uploadTaskCount} />
        <InfoRow label="通知事件数量" value={snapshot.notificationEventCount} />
        <InfoRow label="推送令牌可用" value={snapshot.fcmTokenAvailable} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>端到端加密能力</Text>
        <InfoRow label="是否支持" value={snapshot.e2eeCapability.supported} />
        <InfoRow label="当前模式" value={snapshot.e2eeCapability.mode} />
        <InfoRow label="可发送加密消息" value={snapshot.e2eeCapability.canSendEncrypted} />
        <InfoRow label="可解密消息" value={snapshot.e2eeCapability.canDecryptEncrypted} />
        <InfoRow label="原因" value={snapshot.e2eeCapability.reason} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>最近错误</Text>
        <Text style={styles.errorLabel}>最近接口错误</Text>
        <Text style={styles.errorText}>
          {snapshot.lastApiError
            ? `${snapshot.lastApiError.message} | ${snapshot.lastApiError.status || '未记录'} | ${snapshot.lastApiError.url || '未记录'} | ${formatTime(snapshot.lastApiError.createdAt)}`
            : '未记录'}
        </Text>
        <Text style={styles.errorLabel}>最近长连接错误</Text>
        <Text style={styles.errorText}>
          {snapshot.lastWsError
            ? `${snapshot.lastWsError.message} | ${snapshot.lastWsError.url || '未记录'} | ${formatTime(snapshot.lastWsError.createdAt)}`
            : '未记录'}
        </Text>
        <Text style={styles.errorLabel}>最近警告和错误日志</Text>
        <Text style={styles.errorText}>{recentErrorText}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>操作</Text>
        <PrimaryButton
          label="复制脱敏日志"
          onPress={() => {
            debugDiagnosticsService.copyLogs();
            Alert.alert('日志已复制');
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label="重连长连接"
          onPress={() => {
            void debugDiagnosticsService.reconnectWebsocket().then(() => {
              setSnapshot(debugDiagnosticsService.getSnapshot());
              Alert.alert('已触发重连');
            });
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label="重试待发送"
          onPress={() => {
            void debugDiagnosticsService.retryPending().then(() => {
              setSnapshot(debugDiagnosticsService.getSnapshot());
              Alert.alert('已触发重试');
            });
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton label="清理本地缓存" variant="danger" onPress={confirmClearLocalCache} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  row: {
    gap: spacing.xs,
  },
  label: {
    color: colors.muted,
    fontWeight: '700',
  },
  value: {
    color: colors.text,
  },
  errorLabel: {
    color: colors.muted,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  errorText: {
    color: colors.text,
    lineHeight: 20,
  },
  gap: {
    height: spacing.sm,
  },
});
