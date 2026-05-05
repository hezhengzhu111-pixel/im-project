import { ElMessage } from "element-plus";
import { useI18nStore } from "@/stores/i18n";
import { registerResponseInterceptor } from "@/utils/httpClient";

const getI18nT = () => {
  try {
    return useI18nStore().t;
  } catch {
    return (key: string) => key;
  }
};

const ERROR_MESSAGES: Record<number, string> = {
  400: "error.badRequest",
  403: "error.forbidden",
  404: "error.notFound",
  408: "error.requestTimeout",
  413: "error.fileTooLarge",
  500: "error.serverError",
  502: "error.badGateway",
  503: "error.serviceUnavailable",
  504: "error.gatewayTimeout",
};

export const notifyHttpError = (err: any): void => {
  if (!err?.response) {
    return;
  }
  const t = getI18nT();
  const { status, statusText } = err.response;
  const i18nKey = ERROR_MESSAGES[status];
  if (i18nKey) {
    ElMessage.error(t(i18nKey as any));
  } else {
    ElMessage.error(`${t("error.requestFailed")}: ${status} ${statusText}`);
  }
};

export const notifyBusinessError = (
  messageText: string,
  fallbackKey: string,
): void => {
  const t = getI18nT();
  ElMessage.error(messageText || t(fallbackKey as any));
};

export const notifyNetworkError = (): void => {
  const t = getI18nT();
  ElMessage.error(t("error.networkFailed"));
};

export const notifyAuthExpired = (): void => {
  const t = getI18nT();
  ElMessage.warning(t("error.authExpired"));
};

export const registerHttpErrorNotifier = (): void => {
  registerResponseInterceptor(
    // Business error handler (response with non-200 code)
    (response) => {
      const responseData =
        response.data && typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : {};
      const { code, message } = responseData;
      const messageText = typeof message === "string" ? message : "";

      if (
        "success" in responseData &&
        typeof responseData.success === "boolean" &&
        !responseData.success
      ) {
        const authMessage =
          typeof responseData.message === "string"
            ? responseData.message
            : "操作失败";
        ElMessage.error(authMessage);
        return response;
      }

      if (code !== undefined && code !== 200) {
        if (code === 401) {
          // 401 is handled by auth-session-adapter, skip here
          return response;
        }
        const fallbackKey =
          code === 403
            ? "error.forbidden"
            : code === 404
              ? "error.notFound"
              : code === 500
                ? "error.serverInternal"
                : "error.requestFailed";
        notifyBusinessError(messageText, fallbackKey);
      }
      return response;
    },
    // HTTP error handler
    (err: any) => {
      if (!err?.response) {
        notifyNetworkError();
        return Promise.reject(err);
      }

      // 401 is handled by auth-session-adapter, skip here
      if (err.response.status === 401) {
        return undefined;
      }

      notifyHttpError(err);
      return Promise.reject(err);
    },
  );
};
