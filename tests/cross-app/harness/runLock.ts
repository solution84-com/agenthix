// One cross-app run at a time on a machine. The two apps' ports are free ports now, so a second run is no longer
// stopped by a busy port, yet both runs would truncate the same test databases. The lock names the run's process.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const RUN_LOCK = join(tmpdir(), 'agenthix-crossapp-run.lock')

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function acquireRunLock(path = RUN_LOCK, pid = process.pid): void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, String(pid), { flag: 'wx' })
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      const holder = Number(readFileSync(path, 'utf8').trim())
      if (Number.isInteger(holder) && holder > 0 && alive(holder)) {
        throw new Error(
          `Another cross-app run (process ${holder}) is using the test databases. Wait for it to finish, or stop it. Nothing was changed.`,
        )
      }
      rmSync(path, { force: true })
    }
  }
  throw new Error(`The cross-app run lock ${path} could not be taken. Nothing was changed.`)
}

export function releaseRunLock(path = RUN_LOCK, pid = process.pid): void {
  try {
    if (Number(readFileSync(path, 'utf8').trim()) === pid) rmSync(path, { force: true })
  } catch {
    // already gone
  }
}
