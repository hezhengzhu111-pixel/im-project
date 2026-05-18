import { defineConfig } from "vitest/config";

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    environment: "node",
    root: resolve(__dirname),
  },
});
