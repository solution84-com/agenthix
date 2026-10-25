import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import path from 'path'
import { parseEnv } from 'node:util'

// The maintainers' credentials for tests that call outside services (.env.testing.example at the repository's root),
// when the file is there; a value already in the environment wins.
const testing = path.resolve(__dirname, '../.env.testing')
if (fs.existsSync(testing)) {
  for (const [name, value] of Object.entries(parseEnv(fs.readFileSync(testing, 'utf8')))) {
    if (process.env[name] === undefined && value) process.env[name] = value
  }
}

// The model checks (src/conversations/__modelchecks__/README.md): real model calls, on demand and before a release.
// Not the unit suite's provider guard, which fails any call to a model; the same storage and environment set-up
// otherwise, and the same stand-in for wasp/server, so nothing here can reach a database.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__modelchecks__/**/*.models.ts'],
    globalSetup: ['./src/test/storage-root.ts'],
    setupFiles: ['./src/test/environment-setup.ts'],
    // Many models' calls, one after another.
    testTimeout: 60 * 60 * 1000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      'wasp/server': path.resolve(__dirname, '.wasp/out/sdk/wasp/dist/server/HttpError.js'),
    },
  },
})
