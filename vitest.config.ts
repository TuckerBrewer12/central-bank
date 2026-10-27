import { defineConfig } from "vitest/config";

// plugins/pstack ships its own tests for its own runtimes; ours live in test/.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
