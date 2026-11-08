import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Integration tests run against real `*_test` databases (ADR-0035). Launched
// via `npm run test:integration`, which prepares one database per test process
// through scripts/test/with-test-db.mjs (src/test/db.ts picks this process's).
// Files run in parallel, one per process; the tests inside a file run one at a
// time, because each empties its process's database before it starts.
const workers = process.env.TEST_DB_WORKER_NAMES?.split(',').length ?? 1

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.agenthix/**', '**/.wasp/**'],
    globalSetup: ['./src/test/storage-root.ts', './src/test/experimental-failures.ts'],
    setupFiles: ['./src/test/environment-setup.ts', './src/test/provider-guard-setup.ts', './src/test/integration-setup.ts'],
    maxWorkers: workers,
    fileParallelism: workers > 1,
    // Every test empties its database first; on a busy CI runner that hook alone can pass the default ten seconds.
    hookTimeout: 60_000,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      'wasp/server': path.resolve(
        __dirname,
        '.wasp/out/sdk/wasp/dist/server/HttpError.js'
      ),
    },
  },
})
