import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/provider-guard-setup.ts'],
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides). Vitest's
    // default is one per CPU core less one, and a few overlapping runs of that
    // exhausted a 10-core machine's memory.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    // Integration tests run separately via `npm run test:integration` against a
    // real database (ADR-0035) — excluded here so the default `test` run stays
    // fast and needs no database.
    // Checks against a real agent container run separately too (`npm run
    // test:container`, vitest.container.config.ts): they need docker and the image.
    exclude: ['**/node_modules/**', 'dist/**', '.wasp/**', '**/*.integration.test.ts', '**/*.container.test.ts'],
  },
})
