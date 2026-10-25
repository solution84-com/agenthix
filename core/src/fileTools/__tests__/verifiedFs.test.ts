import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  closeQuietly, NotFoundError, openExistingForChange, openExistingForWrite, openFileForWrite, openForRead, PathChangedError, readAll,
  removeFile, replaceContents,
} from '../verifiedFs.js'
import { tempDir, testFdPaths } from './helpers.js'

function project() {
  const root = tempDir()
  const secret = path.join(root, 'home', 'secret.txt')
  fs.mkdirSync(path.dirname(secret))
  fs.writeFileSync(secret, 'TOPSECRET')
  fs.mkdirSync(path.join(root, 'p', 'sub'), { recursive: true })
  fs.writeFileSync(path.join(root, 'p', 'a.txt'), 'hello')
  return { root, secret, p: path.join(root, 'p') }
}

describe('opening only the checked path @SC-1369', () => {
  it('opens a file that is where it was checked, and reads it through the descriptor', () => {
    const { p } = project()
    const opened = openForRead(testFdPaths(), path.join(p, 'a.txt'))
    try {
      expect(opened.stat.isFile()).toBe(true)
      expect(Buffer.from(readAll(opened.fd)).toString()).toBe('hello')
    } finally {
      closeQuietly(opened.fd)
    }
  })

  it('refuses a link at the end of the path', () => {
    const { p, secret } = project()
    fs.symlinkSync(secret, path.join(p, 'link.txt'))
    expect(() => openForRead(testFdPaths(), path.join(p, 'link.txt'))).toThrow(PathChangedError)
  })

  it('refuses a path whose folder is a link', () => {
    const { p, root } = project()
    fs.symlinkSync(path.join(root, 'home'), path.join(p, 'dir'))
    expect(() => openForRead(testFdPaths(), path.join(p, 'dir', 'secret.txt'))).toThrow(PathChangedError)
  })

  it('refuses when a command swaps the checked file for a link between the check and the open', () => {
    const { p, secret } = project()
    const target = path.join(p, 'a.txt')
    const sys = testFdPaths(opening => {
      if (opening !== target) return
      fs.rmSync(target)
      fs.symlinkSync(secret, target)
    })
    expect(() => openForRead(sys, target)).toThrow(PathChangedError)
    expect(() => openExistingForWrite(testFdPaths(), target)).toThrow(PathChangedError)
  })

  it('refuses when a command swaps a folder on the path for a link', () => {
    const { p, root } = project()
    const target = path.join(p, 'sub', 'secret.txt')
    fs.writeFileSync(target, 'harmless')
    const sys = testFdPaths(opening => {
      if (opening !== target) return
      fs.rmSync(path.join(p, 'sub'), { recursive: true })
      fs.symlinkSync(path.join(root, 'home'), path.join(p, 'sub'))
    })
    expect(() => openForRead(sys, target)).toThrow(PathChangedError)
  })

  it('says a missing file is not found', () => {
    const { p } = project()
    expect(() => openForRead(testFdPaths(), path.join(p, 'nope.txt'))).toThrow(NotFoundError)
  })

  it('never opens /proc, and never writes in the harness home', () => {
    expect(() => openForRead(testFdPaths(), '/proc/self/environ')).toThrow(PathChangedError)
    expect(() => openFileForWrite(testFdPaths(), '/home/appuser/.claude.json')).toThrow(PathChangedError)
    expect(() => openFileForWrite(testFdPaths(), '/proc/1/mem')).toThrow(PathChangedError)
  })
})

describe('writing through the checked descriptor @SC-1369', () => {
  it('creates a file with its missing folders, each made inside its checked parent', () => {
    const { p } = project()
    const target = path.join(p, 'x', 'y', 'new.txt')
    const opened = openFileForWrite(testFdPaths(), target)
    try {
      expect(opened.created).toBe(true)
      replaceContents(opened.fd, Buffer.from('made'))
    } finally {
      closeQuietly(opened.fd)
    }
    expect(fs.readFileSync(target, 'utf-8')).toBe('made')
  })

  it('refuses a new file under a folder that is a link', () => {
    const { p, root } = project()
    fs.symlinkSync(path.join(root, 'home'), path.join(p, 'out'))
    expect(() => openFileForWrite(testFdPaths(), path.join(p, 'out', 'planted.txt'))).toThrow(PathChangedError)
    expect(fs.existsSync(path.join(root, 'home', 'planted.txt'))).toBe(false)
  })

  it('refuses a link planted where the new file would go', () => {
    const { p, secret } = project()
    fs.symlinkSync(secret, path.join(p, 'new.txt'))
    expect(() => openFileForWrite(testFdPaths(), path.join(p, 'new.txt'))).toThrow(PathChangedError)
    expect(fs.readFileSync(secret, 'utf-8')).toBe('TOPSECRET')
  })

  it('says a file in the way of a folder is not a folder, rather than that the path changed', () => {
    const { p } = project()
    const failure = (fn: () => unknown) => { try { fn(); return null } catch (err) { return err } }
    for (const target of [path.join(p, 'a.txt', 'new.txt'), path.join(p, 'a.txt', 'x', 'new.txt')]) {
      const err = failure(() => openFileForWrite(testFdPaths(), target))
      expect(err).not.toBeInstanceOf(PathChangedError)
      expect(err).toMatchObject({ code: 'ENOTDIR' })
    }
    const removal = failure(() => removeFile(testFdPaths(), path.join(p, 'a.txt', 'x')))
    expect(removal).not.toBeInstanceOf(PathChangedError)
    expect(removal).toMatchObject({ code: 'ENOTDIR' })
    expect(fs.readFileSync(path.join(p, 'a.txt'), 'utf-8')).toBe('hello')
  })

  it('replaces the whole of an existing file', () => {
    const { p } = project()
    const opened = openFileForWrite(testFdPaths(), path.join(p, 'a.txt'))
    try {
      expect(opened.created).toBe(false)
      replaceContents(opened.fd, Buffer.from('hi'))
    } finally {
      closeQuietly(opened.fd)
    }
    expect(fs.readFileSync(path.join(p, 'a.txt'), 'utf-8')).toBe('hi')
  })
})

describe('changing and removing only the checked path @SC-1369', () => {
  it('opens an existing file to change read-only, and never one in the harness home', () => {
    const { p } = project()
    const opened = openExistingForChange(testFdPaths(), path.join(p, 'a.txt'))
    try {
      expect(Buffer.from(readAll(opened.fd)).toString()).toBe('hello')
    } finally {
      closeQuietly(opened.fd)
    }
    expect(() => openExistingForChange(testFdPaths(), '/home/appuser/.claude.json')).toThrow(PathChangedError)
    expect(() => openExistingForChange(testFdPaths(), path.join(p, 'nope.txt'))).toThrow(NotFoundError)
  })

  it('removes a file inside its checked folder, and a link itself rather than what it leads to', () => {
    const { p, secret } = project()
    removeFile(testFdPaths(), path.join(p, 'a.txt'))
    expect(fs.existsSync(path.join(p, 'a.txt'))).toBe(false)
    fs.symlinkSync(secret, path.join(p, 'l.txt'))
    removeFile(testFdPaths(), path.join(p, 'l.txt'))
    expect(fs.existsSync(path.join(p, 'l.txt'))).toBe(false)
    expect(fs.readFileSync(secret, 'utf-8')).toBe('TOPSECRET')
    expect(() => removeFile(testFdPaths(), path.join(p, 'gone', 'x.txt'))).toThrow(NotFoundError)
  })

  it('refuses a removal whose folder is, or becomes, a link', () => {
    const { p, root, secret } = project()
    fs.symlinkSync(path.join(root, 'home'), path.join(p, 'dir'))
    expect(() => removeFile(testFdPaths(), path.join(p, 'dir', 'secret.txt'))).toThrow(PathChangedError)
    const sub = path.join(p, 'sub')
    fs.writeFileSync(path.join(sub, 'secret.txt'), 'harmless')
    const sys = testFdPaths(opening => {
      if (opening !== sub) return
      fs.rmSync(sub, { recursive: true })
      fs.symlinkSync(path.join(root, 'home'), sub)
    })
    expect(() => removeFile(sys, path.join(sub, 'secret.txt'))).toThrow(PathChangedError)
    expect(fs.readFileSync(secret, 'utf-8')).toBe('TOPSECRET')
    expect(() => removeFile(testFdPaths(), '/home/appuser/.claude.json')).toThrow(PathChangedError)
    expect(() => removeFile(testFdPaths(), '/proc/self/environ')).toThrow(PathChangedError)
  })
})
