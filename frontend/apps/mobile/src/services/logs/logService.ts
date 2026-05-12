import { http } from '@/services/api/httpClient';
import { logger } from '@/utils/logger';

export const logService = {
  getAdminLogs: (query?: Record<string, unknown>) => http.get<unknown[]>('/admin/logs', { params: query } as never),
  getLocalLogs: () => logger.list(),
  clearLocalLogs: () => logger.clear(),
};
