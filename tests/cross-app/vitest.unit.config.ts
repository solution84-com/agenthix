import { defineConfig } from 'vitest/config'

// The harness's own tests: they start no app and touch no database, so no global setup.
export default defineConfig({ test: { include: ['harness/**/*.unit.test.ts'] } })
