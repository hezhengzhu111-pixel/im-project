import { describe, expect, it } from "vitest";
import {
  validateEmail,
  validatePhone,
  validateUsername,
  validatePasswordStrength,
} from "../validation.js";

// ── validateEmail ──────────────────────────────────────────────

describe("validateEmail", () => {
  it("returns true for a standard valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("returns true for email with subdomain", () => {
    expect(validateEmail("user@sub.example.com")).toBe(true);
  });

  it("returns true for email with plus sign", () => {
    expect(validateEmail("user+tag@example.com")).toBe(true);
  });

  it("returns false for email without @ symbol", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });

  it("returns false for email without domain", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  it("returns false for email without username", () => {
    expect(validateEmail("@example.com")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateEmail("")).toBe(false);
  });

  it("returns false for email with spaces", () => {
    expect(validateEmail("user @example.com")).toBe(false);
  });

  it("returns false for email without TLD", () => {
    expect(validateEmail("user@example")).toBe(false);
  });
});

// ── validatePhone ──────────────────────────────────────────────

describe("validatePhone", () => {
  it("returns true for a valid mainland China mobile number", () => {
    expect(validatePhone("13812345678")).toBe(true);
  });

  it("returns true for numbers starting with different valid prefixes (13-19)", () => {
    expect(validatePhone("13912345678")).toBe(true);
    expect(validatePhone("15012345678")).toBe(true);
    expect(validatePhone("17612345678")).toBe(true);
    expect(validatePhone("19912345678")).toBe(true);
  });

  it("returns false for number with too few digits", () => {
    expect(validatePhone("1381234567")).toBe(false);
  });

  it("returns false for number with too many digits", () => {
    expect(validatePhone("138123456789")).toBe(false);
  });

  it("returns false for number starting with invalid prefix", () => {
    expect(validatePhone("12112345678")).toBe(false);
  });

  it("returns false for number containing non-digit characters", () => {
    expect(validatePhone("1381234a5678")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validatePhone("")).toBe(false);
  });
});

// ── validateUsername ───────────────────────────────────────────

describe("validateUsername", () => {
  it("returns true for valid username (3-20 alphanumeric + underscore)", () => {
    expect(validateUsername("user_123")).toBe(true);
  });

  it("returns true for minimum length (3 characters)", () => {
    expect(validateUsername("abc")).toBe(true);
  });

  it("returns true for maximum length (20 characters)", () => {
    expect(validateUsername("a".repeat(20))).toBe(true);
  });

  it("returns true for username containing only letters", () => {
    expect(validateUsername("username")).toBe(true);
  });

  it("returns false for username shorter than 3 characters", () => {
    expect(validateUsername("ab")).toBe(false);
  });

  it("returns false for username longer than 20 characters", () => {
    expect(validateUsername("a".repeat(21))).toBe(false);
  });

  it("returns false for username with special characters", () => {
    expect(validateUsername("user@name")).toBe(false);
  });

  it("returns false for username with spaces", () => {
    expect(validateUsername("user name")).toBe(false);
  });

  it("returns false for username with Chinese characters", () => {
    expect(validateUsername("用户名")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateUsername("")).toBe(false);
  });
});

// ── validatePasswordStrength ───────────────────────────────────

describe("validatePasswordStrength", () => {
  it("returns isValid=true when score >= 4", () => {
    // Meets all 5 criteria: length + lower + upper + digit + special
    const result = validatePasswordStrength("Abcd1234!");
    expect(result.isValid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("returns isValid=true with score exactly 4 (missing one criterion)", () => {
    // Length(8) + lower + upper + digit = 4
    const result = validatePasswordStrength("Abcd1234");
    expect(result.isValid).toBe(true);
    expect(result.score).toBe(4);
  });

  it("returns isValid=false with score below 4", () => {
    const result = validatePasswordStrength("short");
    expect(result.isValid).toBe(false);
    expect(result.score).toBeLessThan(4);
  });

  it("returns feedback for a weak password", () => {
    const result = validatePasswordStrength("abc");
    expect(result.feedback.length).toBeGreaterThan(0);
    expect(result.isValid).toBe(false);
  });

  it("detects missing uppercase letter", () => {
    const result = validatePasswordStrength("abcdefgh1!");
    // length(8) + lower + digit + special = 4; missing uppercase
    expect(result.score).toBe(4);
    expect(result.feedback).toContain("密码应包含大写字母");
    expect(result.isValid).toBe(true);
  });

  it("detects missing special character", () => {
    const result = validatePasswordStrength("Abcdefgh1");
    // length(8) + lower + upper + digit = 4; missing special
    expect(result.score).toBe(4);
    expect(result.feedback).toContain("密码应包含特殊字符");
    expect(result.isValid).toBe(true);
  });

  it("detects multiple missing criteria", () => {
    const result = validatePasswordStrength("abc");
    expect(result.score).toBe(1); // only lower = 1
    expect(result.feedback).toContain("密码长度至少8位");
    expect(result.feedback).toContain("密码应包含大写字母");
    expect(result.feedback).toContain("密码应包含数字");
    expect(result.feedback).toContain("密码应包含特殊字符");
    expect(result.isValid).toBe(false);
  });

  it("handles empty string", () => {
    const result = validatePasswordStrength("");
    expect(result.score).toBe(0);
    expect(result.isValid).toBe(false);
    expect(result.feedback).toContain("密码长度至少8位");
  });

  it("handles password with all criteria except length", () => {
    // "Ab1!" — length=4 (<8), lower=a, upper=A, digit=1, special=!
    // score = 4 (lower + upper + digit + special), isValid = true (>=4)
    const result = validatePasswordStrength("Ab1!");
    expect(result.score).toBe(4);
    expect(result.isValid).toBe(true);
    expect(result.feedback).toContain("密码长度至少8位");
    expect(result.feedback.length).toBe(1);
  });

  it("does not mutate input password", () => {
    const password = "Test1234!";
    const original = password;
    validatePasswordStrength(password);
    expect(password).toBe(original);
  });
});
