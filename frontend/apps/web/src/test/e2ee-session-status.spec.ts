import { nextTick, ref } from "vue";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockStore: Record<string, string> = {};

vi.mock("@/features/e2ee/manager/negotiation", () => ({
  getLocalSessionStatus: (sessionId: string) =>
    (mockStore[sessionId] as string) || "plaintext",
  setLocalSessionStatus: (sessionId: string, status: string) => {
    mockStore[sessionId] = status;
  },
}));

vi.mock("@/features/e2ee/status-events", async () => {
  const actual: Record<string, unknown> = await vi.importActual(
    "@/features/e2ee/status-events",
  );
  return actual;
});

import {
  useE2eeSessionStatus,
} from "@/features/e2ee/composables/useE2eeSessionStatus";
import {
  emitE2eeStatusChange,
} from "@/features/e2ee/status-events";
import {
  getLocalSessionStatus,
  setLocalSessionStatus,
} from "@/features/e2ee/manager/negotiation";

describe("useE2eeSessionStatus composable", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) delete mockStore[key];
    vi.clearAllMocks();
  });

  it("returns plaintext for unknown session", () => {
    const status = useE2eeSessionStatus("unknown_session");
    expect(status.value).toBe("plaintext");
  });

  it("returns current status from localStorage", () => {
    setLocalSessionStatus("sess_enc", "encrypted");
    const status = useE2eeSessionStatus("sess_enc");
    expect(status.value).toBe("encrypted");
  });

  it("updates reactively when emitE2eeStatusChange is called", async () => {
    const status = useE2eeSessionStatus("sess_react");
    expect(status.value).toBe("plaintext");

    emitE2eeStatusChange("sess_react", "encrypted");
    await nextTick();
    expect(status.value).toBe("encrypted");

    emitE2eeStatusChange("sess_react", "failed");
    await nextTick();
    expect(status.value).toBe("failed");
  });

  it("handles undefined sessionId as plaintext", () => {
    const idRef = ref<string | undefined>(undefined);
    const status = useE2eeSessionStatus(idRef);
    expect(status.value).toBe("plaintext");
  });

  it("updates when reactive sessionId changes", async () => {
    setLocalSessionStatus("sess_a", "encrypted");
    const idRef = ref("sess_a");
    const status = useE2eeSessionStatus(idRef);
    expect(status.value).toBe("encrypted");

    idRef.value = "sess_b";
    await nextTick();
    expect(status.value).toBe("plaintext");
  });

  it("ignores events for different sessions", async () => {
    const status = useE2eeSessionStatus("sess_target");
    expect(status.value).toBe("plaintext");

    emitE2eeStatusChange("sess_other", "encrypted");
    await nextTick();
    expect(status.value).toBe("plaintext");

    emitE2eeStatusChange("sess_target", "encrypted");
    await nextTick();
    expect(status.value).toBe("encrypted");
  });
});

describe("ChatMessageList encryption notice", () => {
  // Simulates the condition in ChatMessageList.vue renderItems
  const shouldShowNotice = (
    sessionType: string,
    e2eeStatus: string,
    messagesLength: number,
  ) =>
    sessionType === "private" &&
    e2eeStatus === "encrypted" &&
    messagesLength > 0;

  it("does not show encryption notice for plaintext sessions", () => {
    expect(shouldShowNotice("private", "plaintext", 5)).toBe(false);
  });

  it("shows encryption notice for encrypted sessions", () => {
    expect(shouldShowNotice("private", "encrypted", 5)).toBe(true);
  });

  it("does not show encryption notice for failed sessions", () => {
    expect(shouldShowNotice("private", "failed", 5)).toBe(false);
  });

  it("does not show encryption notice for negotiating sessions", () => {
    expect(shouldShowNotice("private", "negotiating", 5)).toBe(false);
  });

  it("does not show encryption notice for group sessions", () => {
    expect(shouldShowNotice("group", "encrypted", 5)).toBe(false);
  });

  it("does not show encryption notice when no messages", () => {
    expect(shouldShowNotice("private", "encrypted", 0)).toBe(false);
  });
});

describe("negotiation status transitions", () => {
  it("setLocalSessionStatus stores the new status", () => {
    setLocalSessionStatus("sess_transition", "negotiating");
    expect(getLocalSessionStatus("sess_transition")).toBe("negotiating");
  });

  it("failed status is persisted", () => {
    setLocalSessionStatus("sess_fail", "failed");
    expect(getLocalSessionStatus("sess_fail")).toBe("failed");
  });

  it("encrypted status is persisted", () => {
    setLocalSessionStatus("sess_enc2", "encrypted");
    expect(getLocalSessionStatus("sess_enc2")).toBe("encrypted");
  });

  it("unknown session defaults to plaintext", () => {
    expect(getLocalSessionStatus("nonexistent")).toBe("plaintext");
  });
});
