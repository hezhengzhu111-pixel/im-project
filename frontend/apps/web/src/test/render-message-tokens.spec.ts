import { describe, expect, it } from "vitest";
import { parseMessageTokens } from "@/features/chat/utils/renderMessageTokens";

describe("parseMessageTokens", () => {
  it("returns empty array for empty text", () => {
    expect(parseMessageTokens("")).toEqual([]);
  });

  it("parses plain text without mentions", () => {
    expect(parseMessageTokens("hello world")).toEqual([
      { type: "plain", text: "hello world" },
    ]);
  });

  it("parses a single mention", () => {
    expect(parseMessageTokens("@张三")).toEqual([
      { type: "mention", text: "@张三" },
    ]);
  });

  it("parses mention followed by plain text", () => {
    expect(parseMessageTokens("@张三 hello")).toEqual([
      { type: "mention", text: "@张三" },
      { type: "plain", text: " hello" },
    ]);
  });

  it("parses plain text followed by mention", () => {
    expect(parseMessageTokens("hello @张三")).toEqual([
      { type: "plain", text: "hello " },
      { type: "mention", text: "@张三" },
    ]);
  });

  it("parses multiple mentions", () => {
    expect(parseMessageTokens("@张三 @李四 hi")).toEqual([
      { type: "mention", text: "@张三" },
      { type: "plain", text: " " },
      { type: "mention", text: "@李四" },
      { type: "plain", text: " hi" },
    ]);
  });

  it("preserves newlines in plain text", () => {
    expect(parseMessageTokens("line1\nline2")).toEqual([
      { type: "plain", text: "line1\nline2" },
    ]);
  });

  it("does not escape HTML characters", () => {
    // Vue template handles escaping via {{ }} interpolation
    const tokens = parseMessageTokens('<img src=x onerror=alert(1)>');
    expect(tokens).toEqual([
      { type: "plain", text: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it("handles mention with special characters in username", () => {
    expect(parseMessageTokens("@user_name test")).toEqual([
      { type: "mention", text: "@user_name" },
      { type: "plain", text: " test" },
    ]);
  });

  it("handles text that looks like mention but is not (@ followed by space)", () => {
    // @ followed by space is not matched by /@(\S+)/g
    expect(parseMessageTokens("@ hello")).toEqual([
      { type: "plain", text: "@ hello" },
    ]);
  });

  it("handles consecutive mentions without separator as single greedy match", () => {
    // \S+ is greedy so @张三@李四 matches as one mention token
    expect(parseMessageTokens("@张三@李四")).toEqual([
      { type: "mention", text: "@张三@李四" },
    ]);
  });
});
