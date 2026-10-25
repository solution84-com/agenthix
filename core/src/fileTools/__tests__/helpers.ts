/**
 * Test stand-ins: a temporary folder, and descriptor naming on a machine without `/proc` (the kernel's answer is
 * modelled as the real path at the moment of opening, which is what `/proc/self/fd` reports on Linux).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { FdPaths } from '../verifiedFs.js'

export function tempDir(): string {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ahx-file-tools-'))
}

/** `beforeOpen` runs just before each open, as a command racing the tool would. */
export function testFdPaths(beforeOpen?: (p: string) => void): FdPaths {
  const where = new Map<number, string>()
  const real = (p: string) => {
    const parent = fs.realpathSync(path.dirname(p))
    return path.join(parent, path.basename(p))
  }
  return {
    open(p, flags, mode) {
      beforeOpen?.(p)
      const fd = fs.openSync(p, flags, mode)
      where.set(fd, fs.fstatSync(fd).isDirectory() ? fs.realpathSync(p) : real(p))
      return fd
    },
    pathOf(fd) {
      const p = where.get(fd)
      if (!p) throw new Error('unknown descriptor')
      return p
    },
    child(fd, name) {
      return path.join(this.pathOf(fd), name)
    },
  }
}
