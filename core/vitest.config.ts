import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `withFeature` (src/testing) registers its group through the runner's globals.
    globals: true,
    // Clears the last run's experimental failures and prints this run's at the end (adr-0172).
    globalSetup: ['./src/testing/__tests__/setup/experimentalFailures.ts'],
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides). Vitest's
    // default is one per CPU core less one, and a few overlapping runs of that
    // exhausted a 10-core machine's memory.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
  },
})
