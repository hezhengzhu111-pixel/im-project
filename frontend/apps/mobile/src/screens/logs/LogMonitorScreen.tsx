import React, { useEffect, useState } from 'react';
import { FlatList, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
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
    <Screen title="Logs" scroll={false}>
      {!hasPermission('log:read') ? <Text>Admin log permission is not granted. Local app logs are shown.</Text> : null}
      <FlatList
        data={localLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <Text>{item.level} {item.scope}: {item.message}</Text>}
      />
    </Screen>
  );
}
