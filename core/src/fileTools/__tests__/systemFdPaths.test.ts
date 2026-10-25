import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { inodeFdPaths, systemFdPaths } from '../systemFdPaths.js'
import { closeQuietly, openForRead, PathChangedError, procFdPaths } from '../verifiedFs.js'
import { tempDir } from './helpers.js'

describe('naming an open descriptor on this system @SC-1369', () => {
  it('uses /proc/self/fd where there is one, and the inode check elsewhere', () => {
    expect(systemFdPaths()).toBe(fs.existsSync('/proc/self/fd') ? procFdPaths : inodeFdPaths)
  })

  it('without /proc: opens the file at the checked path, and refuses a file whose folder was swapped for a link', () => {
    const root = tempDir()
    const outside = tempDir()
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'sub', 'a.md'), 'a')
    fs.writeFileSync(path.join(outside, 'a.md'), 'TOPSECRET')
    const opened = openForRead(inodeFdPaths, path.join(root, 'sub', 'a.md'))
    closeQuietly(opened.fd)

    fs.rmSync(path.join(root, 'sub'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'sub'))
    expect(() => openForRead(inodeFdPaths, path.join(root, 'sub', 'a.md'))).toThrow(PathChangedError)
  })
})
