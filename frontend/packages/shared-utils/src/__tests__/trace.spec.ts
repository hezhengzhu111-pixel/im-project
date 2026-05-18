import { describe, expect, it } from "vitest";
import { createTraceId } from "../trace.js";

describe("createTraceId", () => {
  it("returns a string value", () => {
    const id = createTraceId();
    expect(typeof id).toBe("string");
  });

  it("returns a non-empty string", () => {
    const id = createTraceId();
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns a UUID v4 format when crypto.randomUUID is available", () => {
    const id = createTraceId();
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("returns unique values on consecutive calls", () => {
    const id1 = createTraceId();
    const id2 = createTraceId();
    expect(id1).not.toBe(id2);
  });

  it("generates many unique trace IDs without collision", () => {
    const ids = new Set<string>();
    const count = 100;
    for (let i = 0; i < count; i++) {
      ids.add(createTraceId());
    }
    expect(ids.size).toBe(count);
  });
});
