import { defineConfig } from 'vitest/config'

// The suite withFeature.test.ts runs in a child vitest: one file, one process, its records in EXPERIMENTAL_FAILURES_DIR.
export default defineConfig({
  test: {
    globals: true,
    include: [process.env.FIXTURE_FILE ?? 'none'],
    globalSetup: ['../setup/experimentalFailures.ts'],
    maxWorkers: 1,
  },
})
