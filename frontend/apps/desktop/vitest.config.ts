import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["adapters/__tests__/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
