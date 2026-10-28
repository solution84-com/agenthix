import { describe, it, expect } from 'vitest'
import { base64OfBytes, bytesOfBase64, bytesOfText, pathProblem, renamedFile, saveInput, textOf, withFile, withoutFile } from '../editorFiles'

describe('text and binary', () => {
  it('reads text, and calls a NUL byte or invalid UTF-8 binary', () => {
    expect(textOf(bytesOfText('héllo\n'))).toBe('héllo\n')
    expect(textOf(new Uint8Array([104, 0, 105]))).toBeNull()
    expect(textOf(new Uint8Array([0xff, 0xfe, 0x41]))).toBeNull()
  })
  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 251)
    expect(Array.from(bytesOfBase64(base64OfBytes(bytes)))).toEqual(Array.from(bytes))
  })
  it('sends text as text and everything else as base64', () => {
    const out = saveInput([{ path: 'a.md', bytes: bytesOfText('hi') }, { path: 'b.png', bytes: new Uint8Array([0, 1]) }])
    expect(out).toEqual([{ path: 'a.md', text: 'hi' }, { path: 'b.png', base64: 'AAE=' }])
  })
})

describe('pathProblem', () => {
  const existing = ['SKILL.md', 'scripts/a.sh']
  it('accepts a new path in a folder', () => expect(pathProblem('scripts/format.py', existing)).toBeNull())
  it('refuses empty, absolute, dotted, hidden and manifest paths', () => {
    for (const p of ['', '/etc/x', 'a//b', '../x', './x', 'a\\b', '.hidden', 'package.json']) expect(pathProblem(p, existing), p).not.toBeNull()
  })
  it('refuses a path that is taken, differs only in case, or would be a file and a folder', () => {
    expect(pathProblem('SKILL.md', existing)).toMatch(/already there/)
    expect(pathProblem('skill.md', existing)).toMatch(/already there/)
    expect(pathProblem('scripts', existing)).toMatch(/file and a folder/)
    expect(pathProblem('SKILL.md/x', existing)).toMatch(/file and a folder/)
  })
  it('lets a file keep its own path when renamed', () => expect(pathProblem('scripts/a.sh', existing, 'scripts/a.sh')).toBeNull())
})

describe('changing the set', () => {
  const files = [{ path: 'b', bytes: new Uint8Array([1]) }, { path: 'a', bytes: new Uint8Array([2]) }]
  it('adds, replaces, removes and renames, keeping the list sorted', () => {
    expect(withFile(files, { path: 'c', bytes: new Uint8Array() }).map(f => f.path)).toEqual(['a', 'b', 'c'])
    expect(withFile(files, { path: 'a', bytes: new Uint8Array([9]) }).find(f => f.path === 'a')?.bytes[0]).toBe(9)
    expect(withoutFile(files, 'a').map(f => f.path)).toEqual(['b'])
    expect(renamedFile(files, 'a', 'z').map(f => f.path)).toEqual(['b', 'z'])
  })
})
