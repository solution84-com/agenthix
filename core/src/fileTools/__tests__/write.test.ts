import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { read, versionOf } from '../read.js'
import { write } from '../write.js'
import { tempDir, testFdPaths } from './helpers.js'

function folder(files: Record<string, string> = {}) {
  const root = tempDir()
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), content)
  }
  return root
}

const entries = (dir: string) => fs.readdirSync(dir).sort()

describe('write: all or nothing, over a root @SC-1371', () => {
  it('creates a file with its folders and gives its version', () => {
    const root = folder()
    const r = write(root, { file: 'p/q/new.md', content: 'hello\n' }, testFdPaths())
    expect(r).toEqual({ ok: true, created: true, version: versionOf(Buffer.from('hello\n')) })
    expect(fs.readFileSync(path.join(root, 'p/q/new.md'), 'utf8')).toBe('hello\n')
    expect(entries(path.join(root, 'p/q'))).toEqual(['new.md'])
  })

  it('replaces a file read at its version, by renaming a whole new file in', () => {
    const root = folder({ 'a.md': 'old' })
    const before = fs.statSync(path.join(root, 'a.md')).ino
    const seen = read(root, { file: 'a.md' }, testFdPaths())
    if (!seen.ok) throw new Error(seen.reason)
    const r = write(root, { file: 'a.md', content: 'new', expectedVersion: seen.version }, testFdPaths())
    expect(r).toEqual({ ok: true, created: false, version: versionOf(Buffer.from('new')) })
    expect(fs.readFileSync(path.join(root, 'a.md'), 'utf8')).toBe('new')
    expect(fs.statSync(path.join(root, 'a.md')).ino).not.toBe(before)
    expect(entries(root)).toEqual(['a.md'])
  })

  it('keeps an existing file\'s permissions', () => {
    const root = folder({ 'a.md': 'old' })
    fs.chmodSync(path.join(root, 'a.md'), 0o640)
    write(root, { file: 'a.md', content: 'new' }, testFdPaths())
    expect(fs.statSync(path.join(root, 'a.md')).mode & 0o777).toBe(0o640)
  })

  it('refuses when the file changed since the version given, and leaves it as it was', () => {
    const root = folder({ 'a.md': 'mine' })
    const stale = versionOf(Buffer.from('what I read'))
    expect(write(root, { file: 'a.md', content: 'x', expectedVersion: stale }, testFdPaths()))
      .toMatchObject({ ok: false, reason: 'changed' })
    expect(write(root, { file: 'gone.md', content: 'x', expectedVersion: stale }, testFdPaths()))
      .toMatchObject({ ok: false, reason: 'changed' })
    expect(fs.readFileSync(path.join(root, 'a.md'), 'utf8')).toBe('mine')
    expect(entries(root)).toEqual(['a.md'])
  })

  it('refuses an existing file when the version says it must be new', () => {
    const root = folder({ 'a.md': 'mine' })
    expect(write(root, { file: 'a.md', content: 'x', expectedVersion: null }, testFdPaths())).toMatchObject({ ok: false, reason: 'exists' })
    expect(write(root, { file: 'b.md', content: 'x', expectedVersion: null }, testFdPaths())).toMatchObject({ ok: true, created: true })
  })

  it('refuses a folder, the root itself, a file in the way of a folder, and content that is too large', () => {
    const root = folder({ 'p/a.md': 'a' })
    expect(write(root, { file: 'p', content: 'x' }, testFdPaths())).toMatchObject({ ok: false, reason: 'not-a-file' })
    expect(write(root, { file: '', content: 'x' }, testFdPaths())).toMatchObject({ ok: false, reason: 'not-a-file' })
    expect(write(root, { file: 'p/a.md/b.md', content: 'x' }, testFdPaths())).toMatchObject({ ok: false, reason: 'not-a-file' })
    expect(write(root, { file: 'big.md', content: 'a'.repeat(10 * 1024 * 1024 + 1) }, testFdPaths())).toMatchObject({ ok: false, reason: 'too-large' })
    expect(write(root, { file: 'x.md', content: 42 as unknown as string }, testFdPaths())).toMatchObject({ ok: false, reason: 'invalid-argument' })
  })

  it('refuses a name leaving its root, and writes nothing outside it @SC-1369', () => {
    const outside = folder()
    const root = folder()
    expect(write(root, { file: `../${path.basename(outside)}/planted.md`, content: 'x' }, testFdPaths()))
      .toMatchObject({ ok: false, reason: 'outside-root' })
    expect(entries(outside)).toEqual([])
  })

  it('never writes through a link, at the end or on the way @SC-1369', () => {
    const outside = folder({ 'secret.md': 'TOPSECRET' })
    const root = folder()
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    fs.symlinkSync(outside, path.join(root, 'out'))
    expect(write(root, { file: 'link.md', content: 'x' }, testFdPaths())).toMatchObject({ ok: false, reason: 'link' })
    expect(write(root, { file: 'out/planted.md', content: 'x' }, testFdPaths())).toMatchObject({ ok: false, reason: 'link' })
    expect(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8')).toBe('TOPSECRET')
    expect(entries(outside)).toEqual(['secret.md'])
  })

  it('refuses when a folder on the way is swapped for a link between the check and the open @SC-1369', () => {
    const outside = folder()
    const root = folder({ 'sub/a.md': 'a' })
    const sub = path.join(root, 'sub')
    const sys = testFdPaths(opening => {
      if (opening !== sub) return
      fs.rmSync(sub, { recursive: true })
      fs.symlinkSync(outside, sub)
    })
    expect(write(root, { file: 'sub/a.md', content: 'x' }, sys)).toMatchObject({ ok: false, reason: 'link' })
    expect(entries(outside)).toEqual([])
  })
})

describe('on this system, with no descriptor naming handed in @SC-1371', () => {
  it('writes, reads back and refuses a link, as with the stand-in', () => {
    const outside = folder({ 'secret.md': 'TOPSECRET' })
    const root = folder()
    const made = write(root, { file: 'p/new.md', content: 'one\ntwo\n' })
    expect(made).toMatchObject({ ok: true, created: true })
    const seen = read(root, { file: 'p/new.md', offset: 2 })
    expect(seen).toMatchObject({ ok: true, content: '     2\ttwo' })
    if (!seen.ok || !made.ok) throw new Error('unreachable')
    expect(seen.version).toBe(made.version)
    expect(write(root, { file: 'p/new.md', content: 'three', expectedVersion: seen.version })).toMatchObject({ ok: true, created: false })
    fs.symlinkSync(outside, path.join(root, 'out'))
    expect(write(root, { file: 'out/secret.md', content: 'x' })).toMatchObject({ ok: false, reason: 'link' })
    expect(read(root, { file: 'out/secret.md' })).toMatchObject({ ok: false, reason: 'link' })
    expect(fs.readFileSync(path.join(outside, 'secret.md'), 'utf8')).toBe('TOPSECRET')
  })
})
