import type {
  RefreshAccessTokenResult,
  RefreshAccessTokenStatus,
  RefreshResult,
} from "./types.js";

/**
 * API contract expected by the refresh coordinator.
 *
 * The `response` returned by `doRefresh` should carry:
 * - `status` — HTTP status code (used for classification on failure)
 * - `data.code` — business-level status code (200 = success)
 * - `data.data` — payload with `expiresInMs` and `refreshExpiresInMs` on success
 * - `data.message` — human-readable error message on failure
 */
export interface RefreshApiAdapter {
  doRefresh(traceId: string): Promise<{
    status: number;
    data: {
      code?: number;
      data?: { expiresInMs?: unknown; refreshExpiresInMs?: unknown };
      message?: string;
    };
  }>;
}

/**
 * Classify an HTTP status code and optional business error code.
 *
 * Permanent auth failures (400/401/403 at either layer) → `"authInvalid"`.
 * Everything else → `"transientError"`.
 */
function classifyFailureStatus(
  status?: number,
  code?: unknown,
): RefreshAccessTokenResult {
  const numericCode = typeof code === "number" ? code : Number(code);
  if (
    status === 401 ||
    status === 403 ||
    numericCode === 401 ||
    numericCode === 403
  ) {
    return "authInvalid";
  }
  if (status === 400 || numericCode === 400) {
    return "authInvalid";
  }
  return "transientError";
}

function normalizeNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Refresh coordinator that merges concurrent refresh attempts into a single
 * in-flight promise and tracks the coordinator status.
 *
 * When multiple HTTP requests receive 401 simultaneously, only one actual
 * refresh call is made. The other callers wait on the same promise.
 *
 * Usage:
 * ```ts
 * const coordinator = createRefreshCoordinator({ doRefresh: myRefreshFn });
 * const result = await coordinator.refresh("trace-123");
 * ```
 */
export function createRefreshCoordinator(adapter: RefreshApiAdapter): {
  refresh: (traceId?: string) => Promise<RefreshResult>;
  status: () => RefreshAccessTokenStatus;
} {
  let inFlight: Promise<RefreshResult> | null = null;
  let currentStatus: RefreshAccessTokenStatus = "idle";

  async function refresh(traceId = ""): Promise<RefreshResult> {
    if (inFlight) {
      return inFlight;
    }

    currentStatus = "refreshing";

    inFlight = (async (): Promise<RefreshResult> => {
      try {
        const response = await adapter.doRefresh(traceId);
        const payload = response?.data;

        if (payload?.code !== 200) {
          currentStatus = "failed";
          return {
            status: classifyFailureStatus(response?.status, payload?.code),
            message:
              typeof payload?.message === "string"
                ? payload.message
                : undefined,
          };
        }

        const data =
          payload?.data && typeof payload.data === "object"
            ? payload.data
            : {};

        currentStatus = "idle";
        return {
          status: "success" as const,
          expiresInMs: normalizeNumber(data.expiresInMs),
          refreshExpiresInMs: normalizeNumber(data.refreshExpiresInMs),
        };
      } catch (error: unknown) {
        currentStatus = "failed";
        return {
          status: "transientError" as const,
          message:
            error instanceof Error ? error.message : "refresh failed",
        };
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function status(): RefreshAccessTokenStatus {
    return currentStatus;
  }

  return { refresh, status };
}
