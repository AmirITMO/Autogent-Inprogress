import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { loadEnv } from "vite";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    env: loadEnv("test", process.cwd(), ""),
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
