import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { read, versionOf } from '../read.js'
import { tempDir, testFdPaths } from './helpers.js'

function folder(files: Record<string, string | Uint8Array> = {}) {
  const root = tempDir()
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), content)
  }
  return root
}

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

describe('read: numbered lines, as Claude Code Read gives them @SC-1370', () => {
  it('numbers lines cat -n style and gives a version of the bytes', () => {
    const root = folder({ 'p/a.md': '# Title\n\nBody\n' })
    const r = read(root, { file: 'p/a.md' }, testFdPaths())
    expect(r).toEqual({
      ok: true,
      content: '     1\t# Title\n     2\t\n     3\tBody',
      version: versionOf(fs.readFileSync(path.join(root, 'p/a.md'))),
      startLine: 1, endLine: 3, totalLines: 3, more: false,
    })
    if (r.ok) expect(r.version).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reads from an offset for a limit of lines, and says there is more', () => {
    const root = folder({ 'a.md': lines(10) })
    const r = read(root, { file: 'a.md', offset: 4, limit: 3 }, testFdPaths())
    expect(r).toMatchObject({ ok: true, content: '     4\tline 4\n     5\tline 5\n     6\tline 6', startLine: 4, endLine: 6, totalLines: 10, more: true })
  })

  it('gives 2,000 lines by default', () => {
    const root = folder({ 'a.md': lines(2500) })
    const r = read(root, { file: 'a.md' }, testFdPaths())
    expect(r).toMatchObject({ ok: true, startLine: 1, endLine: 2000, totalLines: 2500, more: true })
  })

  it('cuts a long line, saying so', () => {
    const root = folder({ 'a.md': 'x'.repeat(5000) + '\nshort\n' })
    const r = read(root, { file: 'a.md' }, testFdPaths())
    if (!r.ok) throw new Error(r.reason)
    const [first, second] = r.content.split('\n')
    expect(first.startsWith('     1\t' + 'x'.repeat(2000))).toBe(true)
    expect(first).not.toContain('x'.repeat(2001))
    expect(first).toMatch(/cut at 2,000 characters/)
    expect(second).toBe('     2\tshort')
  })

  it('reads an empty file, and an offset past the end, as no lines', () => {
    const root = folder({ 'e.md': '', 'a.md': 'one\n' })
    expect(read(root, { file: 'e.md' }, testFdPaths())).toMatchObject({ ok: true, content: '', totalLines: 0, more: false })
    expect(read(root, { file: 'a.md', offset: 5 }, testFdPaths())).toMatchObject({ ok: true, content: '', totalLines: 1, more: false })
  })

  it('reads lines broken by \\r\\n as lines', () => {
    const root = folder({ 'a.md': 'one\r\ntwo' })
    expect(read(root, { file: 'a.md' }, testFdPaths())).toMatchObject({ ok: true, content: '     1\tone\n     2\ttwo' })
  })

  it('refuses bad offsets and limits', () => {
    const root = folder({ 'a.md': 'one\n' })
    for (const bad of [{ offset: -1 }, { offset: 1.5 }, { limit: 0 }, { limit: -3 }, { limit: Number.NaN }]) {
      expect(read(root, { file: 'a.md', ...bad }, testFdPaths())).toMatchObject({ ok: false, reason: 'invalid-argument' })
    }
  })

  it('refuses a folder, a binary file, a missing file and a too-large file', () => {
    const root = folder({ 'p/a.md': 'a', 'b.bin': new Uint8Array([0, 1, 2, 3]) })
    expect(read(root, { file: 'p' }, testFdPaths())).toMatchObject({ ok: false, reason: 'not-a-file' })
    expect(read(root, { file: 'b.bin' }, testFdPaths())).toMatchObject({ ok: false, reason: 'binary' })
    expect(read(root, { file: 'nope.md' }, testFdPaths())).toMatchObject({ ok: false, reason: 'not-found' })
    fs.writeFileSync(path.join(root, 'big.md'), Buffer.alloc(10 * 1024 * 1024 + 1, 'a'))
    expect(read(root, { file: 'big.md' }, testFdPaths())).toMatchObject({ ok: false, reason: 'too-large' })
  })

  it('refuses a name leaving its root and a link @SC-1369', () => {
    const outside = folder({ 'secret.md': 'TOPSECRET' })
    const root = folder({ 'a.md': 'a' })
    fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    expect(read(root, { file: '../' + path.basename(outside) + '/secret.md' }, testFdPaths())).toMatchObject({ ok: false, reason: 'outside-root' })
    expect(read(root, { file: 'link.md' }, testFdPaths())).toMatchObject({ ok: false, reason: 'link' })
  })

  it('refuses when a link is swapped in on the way between the check and the open @SC-1369', () => {
    const outside = folder({ 'secret.md': 'TOPSECRET' })
    const root = folder({ 'sub/secret.md': 'harmless' })
    const target = path.join(root, 'sub', 'secret.md')
    const sys = testFdPaths(opening => {
      if (opening !== target) return
      fs.rmSync(path.join(root, 'sub'), { recursive: true })
      fs.symlinkSync(outside, path.join(root, 'sub'))
    })
    const r = read(root, { file: 'sub/secret.md' }, sys)
    expect(r).toMatchObject({ ok: false, reason: 'link' })
    expect(JSON.stringify(r)).not.toContain('TOPSECRET')
  })
})
