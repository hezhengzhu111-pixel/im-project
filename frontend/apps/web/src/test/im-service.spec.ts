import { describe, expect, it } from "vitest";

describe("imService", () => {
  it("exports an object with expected shape", async () => {
    const { imService } = await import("@/services/im");
    expect(imService).toBeDefined();
    expect(typeof imService).toBe("object");
  });
});
