/**
 * Naming an open descriptor, on the system this runs on. On Linux, where the site runs in production, the kernel
 * names it: `/proc/self/fd` (procFdPaths, as the OpenCode plugin has always used). Elsewhere (macOS, where development
 * runs) nothing names a descriptor, so inodeFdPaths names it by the real path of what was opened, and only when the
 * file at that path is the very file the descriptor holds (same device and inode); otherwise by a name that matches
 * no checked path, so the open is refused.
 *
 * What inodeFdPaths does not give: a name inside an open folder bound to that folder. `child` looks the folder up by
 * its path again, so a folder swapped for a link after it was checked, and before a file is created or renamed inside
 * it, can lead that one step elsewhere. Every later open is still checked.
 */
import fs from 'node:fs'
import path from 'node:path'
import { procFdPaths, type FdPaths } from './verifiedFs.js'

const where = new Map<number, string>()

/** Never equal to a checked path, which is always absolute. */
const UNVERIFIED = '(unverified)'

function realPathOf(fd: number, p: string): string {
  try {
    const real = fs.realpathSync(p)
    const atPath = fs.statSync(real)
    const held = fs.fstatSync(fd)
    return atPath.dev === held.dev && atPath.ino === held.ino ? real : UNVERIFIED
  } catch {
    return UNVERIFIED
  }
}

export const inodeFdPaths: FdPaths = {
  open(p, flags, mode) {
    const fd = fs.openSync(p, flags, mode)
    where.set(fd, realPathOf(fd, p))
    return fd
  },
  pathOf(fd) {
    const p = where.get(fd)
    if (p === undefined) throw new Error('descriptor not opened here')
    return p
  },
  child(dirFd, name) {
    const dir = inodeFdPaths.pathOf(dirFd)
    if (dir === UNVERIFIED) throw new Error('folder not verified')
    return path.join(dir, name)
  },
}

/** procFdPaths on a system with `/proc/self/fd`, inodeFdPaths elsewhere. */
export function systemFdPaths(): FdPaths {
  return fs.existsSync('/proc/self/fd') ? procFdPaths : inodeFdPaths
}
