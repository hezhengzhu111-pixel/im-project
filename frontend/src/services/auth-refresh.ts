import axios from "axios";

export type RefreshAccessTokenStatus =
  | "success"
  | "authInvalid"
  | "transientError";

export interface RefreshAccessTokenResult {
  status: RefreshAccessTokenStatus;
  accessToken?: string;
  expiresInMs?: number;
  refreshExpiresInMs?: number;
  message?: string;
}

const createTraceId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

let refreshInFlight: Promise<RefreshAccessTokenResult> | null = null;

export const refreshAccessTokenRaw = async (traceId: string) => {
  return axios.post(
    "/api/auth/refresh",
    {},
    {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "X-Gateway-Route": "true",
        "X-Trace-Id": traceId,
      },
      withCredentials: true,
      timeout: 10000,
    },
  );
};

const normalizeNumber = (value: unknown): number | undefined => {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const classifyFailureStatus = (status?: number, code?: unknown): RefreshAccessTokenStatus => {
  const numericCode = typeof code === "number" ? code : Number(code);
  if (status === 401 || status === 403 || numericCode === 401 || numericCode === 403) {
    return "authInvalid";
  }
  if (status === 400 || numericCode === 400) {
    return "authInvalid";
  }
  return "transientError";
};

export const refreshAccessTokenCoordinated = async (
  traceId = createTraceId(),
): Promise<RefreshAccessTokenResult> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const response = await refreshAccessTokenRaw(traceId);
      const payload = response?.data;
      if (payload?.code !== 200) {
        return {
          status: classifyFailureStatus(response?.status, payload?.code),
          message: typeof payload?.message === "string" ? payload.message : undefined,
        };
      }

      const data =
        payload?.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : {};
      const accessToken =
        typeof data.accessToken === "string" ? data.accessToken.trim() : "";
      if (!accessToken) {
        return {
          status: "transientError",
          message: "refresh response missing access token",
        };
      }

      return {
        status: "success",
        accessToken,
        expiresInMs: normalizeNumber(data.expiresInMs),
        refreshExpiresInMs: normalizeNumber(data.refreshExpiresInMs),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          status: classifyFailureStatus(error.response?.status, error.response?.data?.code),
          message:
            typeof error.response?.data?.message === "string"
              ? error.response.data.message
              : error.message,
        };
      }
      return {
        status: "transientError",
        message: error instanceof Error ? error.message : "refresh failed",
      };
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};
