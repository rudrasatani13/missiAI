import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environmentMatchGlobs: [
      ['tests/hooks/**', 'jsdom'],
      ['tests/**', 'node'],
    ],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    setupFiles: ["tests/setup.ts"],
  },
})
