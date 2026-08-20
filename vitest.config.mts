import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Route handlers import through the `@/` alias that tsconfig defines, so the
 * test runner has to resolve it the same way to be able to load them.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
