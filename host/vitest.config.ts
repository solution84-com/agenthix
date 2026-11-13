import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // withFeature (adr-0172) uses the runner's globals; the run's experimental failures are summarised at its end.
    globals: true,
    globalSetup: ['./src/test/experimental-failures-setup.ts'],
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides), as in site/.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    // Checks against a real Docker and the built image run separately (`npm run test:container`).
    exclude: ['**/node_modules/**', 'dist/**', '**/*.container.test.ts'],
  },
})
