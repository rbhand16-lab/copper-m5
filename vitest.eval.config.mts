import { defineConfig } from "vitest/config";

// The golden-set evaluation (npm run eval). It calls real models, so it is
// separate from the unit tests in vitest.config.mts.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 15 * 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
