import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/provider-guard-setup.ts'],
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides), as in site/.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    exclude: ['**/node_modules/**', 'dist/**'],
  },
})
