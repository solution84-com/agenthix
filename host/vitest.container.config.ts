import { defineConfig } from 'vitest/config'

// Needs Docker and the host service's image built (`docker build -f host/docker/Dockerfile -t <name> .` at the root).
// Each file runs under a namespace of its own for the run and drives Docker only through the guard
// (`src/__tests__/containerGuard.ts`), which refuses to touch anything outside it, so the suite can run beside a real
// install. One file at a time all the same: a machine runs one HQ, the files that install one share the Fleet
// Console's 127.0.0.1:4300, and the firewall tests time the host service's start.
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['**/*.container.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
