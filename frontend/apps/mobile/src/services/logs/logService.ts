import { ADMIN_ENDPOINTS } from '@im/shared-api-contract';
import { http } from '@/services/api/httpClient';
import { logger } from '@/utils/logger';

export const logService = {
  getAdminLogs: (query?: Record<string, unknown>) => http.get<unknown[]>(ADMIN_ENDPOINTS.LOGS, { params: query } as never),
  getLocalLogs: () => logger.list(),
  clearLocalLogs: () => logger.clear(),
};
