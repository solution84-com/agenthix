import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    hqStorageRoot: string
  }
}

// hq's storage root defaults to three folders above the working directory (hqStoragePaths.ts), which from hq/ is
// outside the repository, and a developer's own HQ_STORAGE_ROOT holds their data. A test run keeps its files in a
// temporary folder of its own instead, removed when the run ends; environment-setup.ts points each test file at it.
export default function setup(project: TestProject): () => void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hq-test-storage-'))
  project.provide('hqStorageRoot', root)
  return () => fs.rmSync(root, { recursive: true, force: true })
}
