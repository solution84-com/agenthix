import { defineConfig } from 'vitest/config'

// Integration tests run against the real `agenthix_site_test` database
// (ADR-0035). Launched via `npm run test:integration`, which points
// DATABASE_URL at the test DB through scripts/test/with-test-db.mjs. Tests
// run serially — they share one database and truncate it between tests.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', '.wasp/**'],
    setupFiles: ['./src/test/provider-guard-setup.ts', './src/test/integration-setup.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
  },
})
