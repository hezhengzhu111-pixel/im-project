import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { colors, spacing, typography } from '@/app/theme';
import { logService } from '@/services/logs/logService';
import { useAuthStore } from '@/stores/authStore';
import type { LocalLogEntry } from '@/types/models';

export function LogMonitorScreen() {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [localLogs, setLocalLogs] = useState<LocalLogEntry[]>([]);

  useEffect(() => {
    setLocalLogs(logService.getLocalLogs());
    if (hasPermission('log:read')) {
      void logService.getAdminLogs().catch(() => undefined);
    }
  }, [hasPermission]);

  return (
    <Screen title="日志" scroll={false}>
      {!hasPermission('log:read') ? <Text style={styles.notice}>当前没有管理日志权限，仅显示本地应用日志。</Text> : null}
      <FlatList
        data={localLogs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={localLogs.length === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<EmptyState title="暂无本地日志" />}
        renderItem={({ item }) => (
          <View style={styles.logItem}>
            <Text style={styles.logMeta}>{item.level.toUpperCase()} · {item.scope}</Text>
            <Text style={styles.logMessage}>{item.message}</Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.primarySoft,
    color: colors.encrypted,
    fontSize: typography.small,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  logItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  logMeta: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  logMessage: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
