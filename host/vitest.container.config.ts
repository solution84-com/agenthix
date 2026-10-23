import { defineConfig } from 'vitest/config'

// Needs Docker and the host service's image built (`docker build -f host/docker/Dockerfile -t <name> .` at the root).
// Each file runs under a namespace of its own for the run and drives Docker only through the guard
// (`src/__tests__/containerGuard.ts`), which refuses to touch anything outside it, so the suite can run beside a real
// installation, each publishing only free ports it chooses. One file at a time all the same: they share the Docker
// daemon and the firewall tests time the host service's start.
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
