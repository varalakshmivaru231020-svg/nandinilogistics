import "dotenv/config";
import { defineConfig } from "vitest/config";
import { resolve } from "path";

const here = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres database, so they must not race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/permissions/codes.ts", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(here, "./src"),
      // Server-only modules are the ones most worth testing; the import guard
      // exists to protect the client bundle, which tests do not have.
      "server-only": resolve(here, "./tests/stubs/server-only.ts"),
    },
  },
});
