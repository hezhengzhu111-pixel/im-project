import {ElMessage} from "element-plus";
import {logger} from "@/utils/logger";

const showBubbleMessage = (
  type: "success" | "info" | "warning" | "error",
  message: string,
) => {
  ElMessage({
    type,
    message,
    duration: type === "error" ? 2400 : 1600,
    showClose: false,
    grouping: true,
  });
};

const normalizeErrorMessage = (error: unknown, fallback: string): string => {
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
      showBubbleMessage("error", message);
    }
    return message;
  };

  const notifyInfo = (message: string) => {
    logger.info(`${scope}: ${message}`);
    showBubbleMessage("info", message);
  };

  const notifySuccess = (message: string) => {
    showBubbleMessage("success", message);
  };

  return {
    capture,
    notifyInfo,
    notifySuccess,
  };
}
