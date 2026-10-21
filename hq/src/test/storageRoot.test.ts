import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getHqStorageRoot } from '../server/hqStoragePaths'

// Unset, the root is three folders above the working directory, which from hq/ is outside the repository.
describe("hq's storage in a test run @SC-1151", () => {
  it('is a temporary folder of the run’s own, whatever HQ_STORAGE_ROOT the shell had', () => {
    const root = getHqStorageRoot()
    expect(process.env.HQ_STORAGE_ROOT).toBe(root)
    expect(path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(root))).toMatch(/^hq-test-storage-[^/]+$/)
  })
})
