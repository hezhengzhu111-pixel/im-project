import { ElMessage } from "element-plus";
import { logger } from "@/utils/logger";

const normalizeErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
};

export function useErrorHandler(scope = "app") {
  const capture = (
    error: unknown,
    fallbackMessage: string,
    options?: {
      silent?: boolean;
    },
  ): string => {
    const message = normalizeErrorMessage(error, fallbackMessage);
    logger.error(`${scope}: ${message}`, error);
    if (!options?.silent) {
      ElMessage.error(message);
    }
    return message;
  };

  const notifyInfo = (message: string) => {
    logger.info(`${scope}: ${message}`);
    ElMessage.info(message);
  };

  const notifySuccess = (message: string) => {
    ElMessage.success(message);
  };

  return {
    capture,
    notifyInfo,
    notifySuccess,
  };
}
