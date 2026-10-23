import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireRunLock, releaseRunLock } from './runLock'

const dirs: string[] = []
const lockPath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'runlock-test-'))
  dirs.push(dir)
  return join(dir, 'run.lock')
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('the run lock @SC-1252', () => {
  it('is taken, refused while its holder lives, and released', () => {
    const path = lockPath()
    acquireRunLock(path, process.pid)
    expect(() => acquireRunLock(path, 999999)).toThrow(/Another cross-app run.*Nothing was changed\./)
    releaseRunLock(path, process.pid)
    expect(existsSync(path)).toBe(false)
  })

  it('is taken over from a holder that is gone', () => {
    const path = lockPath()
    writeFileSync(path, '2147483646')
    acquireRunLock(path, process.pid)
    releaseRunLock(path, process.pid)
    expect(existsSync(path)).toBe(false)
  })
})
