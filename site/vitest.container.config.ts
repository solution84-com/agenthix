import { defineConfig } from 'vitest/config'

// Checks that run against a real agent container (`*.container.test.ts`):
// they need docker and the agent image, start one capped container at a time,
// and call no model — the model and the platform's tools are local stand-ins.
// Not part of `npm test`; run with `npm run test:container`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.container.test.ts', 'opencode-plugin/**/*.container.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', '.wasp/**'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
})
