import { describe, expect, it } from "vitest";
import { maskSensitiveInfo } from "../mask.js";

describe("maskSensitiveInfo.email", () => {
  it("masks email with username longer than 2 characters", () => {
    expect(maskSensitiveInfo.email("testuser@example.com")).toBe("te***r@example.com");
  });

  it("masks email with 2-character username", () => {
    expect(maskSensitiveInfo.email("ab@example.com")).toBe("a***@example.com");
  });

  it("masks email with 1-character username", () => {
    expect(maskSensitiveInfo.email("a@example.com")).toBe("a***@example.com");
  });

  it("returns empty string for empty input", () => {
    expect(maskSensitiveInfo.email("")).toBe("");
  });

  it("handles email with special characters in domain", () => {
    expect(maskSensitiveInfo.email("hello@sub.example.com")).toBe("he***o@sub.example.com");
  });
});

describe("maskSensitiveInfo.phone", () => {
  it("masks middle 4 digits of a standard 11-digit phone number", () => {
    expect(maskSensitiveInfo.phone("13812345678")).toBe("138****5678");
  });

  it("returns empty string for empty input", () => {
    expect(maskSensitiveInfo.phone("")).toBe("");
  });

  it("masks first 4 middle digits regardless of total length", () => {
    // regex: (\d{3})\d{4}(\d{4}) — first 3, then 4 masked, then last 4
    expect(maskSensitiveInfo.phone("8613812345678")).toBe("861****345678");
  });
});

describe("maskSensitiveInfo.idCard", () => {
  it("masks middle 8 digits of an 18-digit ID card number", () => {
    expect(maskSensitiveInfo.idCard("110101199001011234")).toBe("110101********1234");
  });

  it("returns empty string for empty input", () => {
    expect(maskSensitiveInfo.idCard("")).toBe("");
  });

  it("does not match ID card number ending with X (digit-only regex)", () => {
    // The regex requires 8+4 digits in the middle; X is not a digit, so no replacement occurs
    expect(maskSensitiveInfo.idCard("11010119900101123X")).toBe("11010119900101123X");
  });
});

describe("maskSensitiveInfo object consistency", () => {
  it("exports three masking methods", () => {
    expect(typeof maskSensitiveInfo.email).toBe("function");
    expect(typeof maskSensitiveInfo.phone).toBe("function");
    expect(typeof maskSensitiveInfo.idCard).toBe("function");
  });

  it("all methods return a string", () => {
    expect(typeof maskSensitiveInfo.email("a@b.com")).toBe("string");
    expect(typeof maskSensitiveInfo.phone("13812345678")).toBe("string");
    expect(typeof maskSensitiveInfo.idCard("110101199001011234")).toBe("string");
  });
});
