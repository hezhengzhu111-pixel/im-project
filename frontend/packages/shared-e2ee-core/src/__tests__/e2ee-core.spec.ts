import { describe, expect, it } from "vitest";
import {
  E2eePolicyError,
  assertNoPlaintextDowngrade,
  classifyE2eeError,
  isEncryptedValue,
  sanitizeE2eeLogValue,
  type E2eeSessionStatus,
} from "../index";

describe("shared-e2ee-core", () => {
  it("exports the shared E2EE session status type", () => {
    const status: E2eeSessionStatus = "encrypted";
    expect(status).toBe("encrypted");
  });

  it("classifies known E2EE errors without leaking raw details", () => {
    expect(classifyE2eeError(new Error("No ratchet state for session private_1_2"))).toMatchObject({
      code: "NO_RATCHET_STATE",
      category: "state",
      retryable: true,
    });
    expect(classifyE2eeError("E2EE negotiation has not been accepted")).toMatchObject({
      code: "NEGOTIATION_NOT_ACCEPTED",
      category: "negotiation",
    });
    expect(classifyE2eeError(new E2eePolicyError(
      "Plaintext downgrade blocked",
      "PLAINTEXT_DOWNGRADE_BLOCKED",
      "policy",
    ))).toMatchObject({
      code: "PLAINTEXT_DOWNGRADE_BLOCKED",
      category: "policy",
    });
  });

  it("normalizes encrypted markers", () => {
    expect(isEncryptedValue(true)).toBe(true);
    expect(isEncryptedValue(1)).toBe(true);
    expect(isEncryptedValue("1")).toBe(true);
    expect(isEncryptedValue("true")).toBe(true);
    expect(isEncryptedValue(false)).toBe(false);
    expect(isEncryptedValue(0)).toBe(false);
    expect(isEncryptedValue("0")).toBe(false);
  });

  it("blocks plaintext downgrade for protected states and markers", () => {
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      sessionStatus: "negotiating",
    })).toThrow(E2eePolicyError);
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      messageEncrypted: 1,
    })).toThrow(E2eePolicyError);
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: true,
      sessionStatus: "plaintext",
      messageEncrypted: false,
    })).not.toThrow();
    expect(() => assertNoPlaintextDowngrade({
      attemptedPlaintext: false,
      sessionStatus: "encrypted",
    })).not.toThrow();
  });

  it("redacts E2EE-sensitive log fields recursively", () => {
    const result = sanitizeE2eeLogValue({
      sessionId: "private_1_2",
      content: "hello",
      e2eeHeader: "{\"counter\":1}",
      nested: {
        rootKey: "secret",
        counter: 3,
      },
      list: [{ mediaKey: "secret" }],
    });

    expect(result).toEqual({
      sessionId: "private_1_2",
      content: "[REDACTED:E2EE]",
      e2eeHeader: "[REDACTED:E2EE]",
      nested: {
        rootKey: "[REDACTED:E2EE]",
        counter: 3,
      },
      list: [{ mediaKey: "[REDACTED:E2EE]" }],
    });
  });
});
