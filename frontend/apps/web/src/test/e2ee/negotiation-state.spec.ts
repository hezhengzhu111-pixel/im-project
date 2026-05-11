import { beforeEach, describe, expect, it } from "vitest";
import {
  getLocalSessionStatus,
  getPendingInitialHandshake,
  markNegotiationAccepted,
} from "@/features/e2ee/manager/negotiation";

describe("E2EE negotiation local state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears the initial handshake cache when negotiation is accepted", () => {
    const sessionId = "user1_user2";
    localStorage.setItem(
      `e2ee:initial-handshake:${sessionId}`,
      JSON.stringify({
        senderIdentityKey: "identity",
        ephemeralPublicKey: "ephemeral",
        deviceId: "device-2",
      }),
    );

    markNegotiationAccepted(sessionId);

    expect(getLocalSessionStatus(sessionId)).toBe("encrypted");
    expect(getPendingInitialHandshake(sessionId)).toBeNull();
  });
});
