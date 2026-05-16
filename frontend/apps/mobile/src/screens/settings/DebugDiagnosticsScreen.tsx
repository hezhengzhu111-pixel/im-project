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
    return 'N/A';
  }
  return new Date(value).toLocaleString();
};

const InfoRow = ({ label, value }: { label: string; value: string | number | boolean }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{String(value)}</Text>
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
        ? 'No recent warnings or errors'
        : snapshot.recentErrors
            .map((entry) => `${new Date(entry.createdAt).toLocaleTimeString()} ${entry.level.toUpperCase()} ${entry.scope}: ${entry.message}`)
            .join('\n'),
    [snapshot.recentErrors],
  );

  const confirmClearLocalCache = () => {
    Alert.alert('Clear local cache?', 'This keeps your login session but removes local cache, pending data, upload tasks, and recent diagnostics.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        onPress: () => {
          Alert.alert('Confirm cache clear', 'This cannot be undone. Clear local cache now?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear',
              style: 'destructive',
              onPress: () => {
                debugDiagnosticsService.clearLocalCache();
                setSnapshot(debugDiagnosticsService.getSnapshot());
                Alert.alert('Local cache cleared');
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <Screen
      title="Debug Diagnostics"
      onRefresh={() => {
        setSnapshot(debugDiagnosticsService.getSnapshot());
      }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Runtime</Text>
        <InfoRow label="App env" value={snapshot.appEnv} />
        <InfoRow label="API base" value={snapshot.apiBaseUrl} />
        <InfoRow label="WS base" value={snapshot.wsBaseUrl} />
        <InfoRow label="Current user id" value={snapshot.currentUserId || 'Not logged in'} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Status</Text>
        <InfoRow label="WebSocket" value={snapshot.websocketStatus} />
        <InfoRow label="Reconnect attempts" value={snapshot.reconnectAttempts} />
        <InfoRow label="Storage mode" value={snapshot.storageMode} />
        <InfoRow label="Persistence available" value={snapshot.persistenceAvailable} />
        <InfoRow label="Schema version" value={snapshot.schemaVersion ?? 'N/A'} />
        <InfoRow label="Target schema" value={snapshot.targetSchemaVersion} />
        <InfoRow label="Migration status" value={snapshot.migrationStatus} />
        {snapshot.lastMigrationError ? (
          <InfoRow label="Migration error" value={snapshot.lastMigrationError} />
        ) : null}
        <InfoRow label="Session count" value={snapshot.sessionCount} />
        <InfoRow label="Message count" value={snapshot.messageCount} />
        <InfoRow label="Pending count" value={snapshot.pendingCount} />
        <InfoRow label="Upload task count" value={snapshot.uploadTaskCount} />
        <InfoRow label="Notification event count" value={snapshot.notificationEventCount} />
        <InfoRow label="FCM token available" value={snapshot.fcmTokenAvailable} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>E2EE Capability</Text>
        <InfoRow label="Supported" value={snapshot.e2eeCapability.supported} />
        <InfoRow label="Mode" value={snapshot.e2eeCapability.mode} />
        <InfoRow label="Can send encrypted" value={snapshot.e2eeCapability.canSendEncrypted} />
        <InfoRow label="Can decrypt" value={snapshot.e2eeCapability.canDecryptEncrypted} />
        <InfoRow label="Reason" value={snapshot.e2eeCapability.reason} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Errors</Text>
        <Text style={styles.errorLabel}>Last API error</Text>
        <Text style={styles.errorText}>
          {snapshot.lastApiError
            ? `${snapshot.lastApiError.message} | ${snapshot.lastApiError.status || 'N/A'} | ${snapshot.lastApiError.url || 'N/A'} | ${formatTime(snapshot.lastApiError.createdAt)}`
            : 'N/A'}
        </Text>
        <Text style={styles.errorLabel}>Last WS error</Text>
        <Text style={styles.errorText}>
          {snapshot.lastWsError
            ? `${snapshot.lastWsError.message} | ${snapshot.lastWsError.url || 'N/A'} | ${formatTime(snapshot.lastWsError.createdAt)}`
            : 'N/A'}
        </Text>
        <Text style={styles.errorLabel}>Recent warn/error logs</Text>
        <Text style={styles.errorText}>{recentErrorText}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <PrimaryButton
          label="Copy redacted logs"
          onPress={() => {
            debugDiagnosticsService.copyLogs();
            Alert.alert('Logs copied');
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label="Reconnect WebSocket"
          onPress={() => {
            void debugDiagnosticsService.reconnectWebsocket().then(() => {
              setSnapshot(debugDiagnosticsService.getSnapshot());
              Alert.alert('Reconnect triggered');
            });
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton
          label="Retry pending"
          onPress={() => {
            void debugDiagnosticsService.retryPending().then(() => {
              setSnapshot(debugDiagnosticsService.getSnapshot());
              Alert.alert('Pending retry triggered');
            });
          }}
        />
        <View style={styles.gap} />
        <PrimaryButton label="Clear local cache" onPress={confirmClearLocalCache} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
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
