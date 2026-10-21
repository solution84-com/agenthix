import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveRealWriteTargetWithin } from '../realPathWithin'

let base: string
let realBase: string
let outside: string

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'real-write-base-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'real-write-outside-'))
  realBase = await fs.realpath(base)
  await fs.mkdir(path.join(base, 'docs'))
  await fs.writeFile(path.join(base, 'docs', 'inner.md'), 'inner')
  await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
  await fs.mkdir(path.join(outside, 'dir'))
  await fs.symlink('docs/inner.md', path.join(base, 'inside-link.md'))
  await fs.symlink('docs', path.join(base, 'docs-link'))
  await fs.symlink(path.join(outside, 'secret.md'), path.join(base, 'absolute-out.md'))
  await fs.symlink(path.relative(base, path.join(outside, 'secret.md')), path.join(base, 'relative-out.md'))
  await fs.symlink(path.join(outside, 'dir'), path.join(base, 'dir-out'))
  await fs.symlink(path.relative(base, path.join(outside, 'dir')), path.join(base, 'dir-out-relative'))
  await fs.symlink(path.join(outside, 'missing'), path.join(base, 'dangling-dir'))
})

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('resolveRealWriteTargetWithin', () => {
  it('returns the real path of an existing file inside the base', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'docs', 'inner.md')))
      .toBe(path.join(realBase, 'docs', 'inner.md'))
  })

  it('returns the base itself', async () => {
    expect(await resolveRealWriteTargetWithin(base, base)).toBe(realBase)
  })

  it('appends a missing file, and missing folders, to the real path of what exists', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'docs', 'new.md')))
      .toBe(path.join(realBase, 'docs', 'new.md'))
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'a', 'b', 'new.md')))
      .toBe(path.join(realBase, 'a', 'b', 'new.md'))
  })

  it('follows a folder link that stays inside', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'docs-link', 'new.md')))
      .toBe(path.join(realBase, 'docs', 'new.md'))
  })

  it('refuses a target that is itself a link, even one pointing inside', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'inside-link.md'))).toBeNull()
  })

  it.each(['absolute-out.md', 'relative-out.md'])('refuses %s, a link that leaves the base', async (name) => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, name))).toBeNull()
  })

  it.each(['dir-out', 'dir-out-relative'])('refuses a new file under %s, a folder link that leaves the base', async (name) => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, name, 'new.md'))).toBeNull()
    expect(await resolveRealWriteTargetWithin(base, path.join(base, name, 'x', 'new.md'))).toBeNull()
  })

  it('refuses a new file under a dangling link', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'dangling-dir', 'new.md'))).toBeNull()
  })

  it('refuses a target under a file', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, 'docs', 'inner.md', 'x'))).toBeNull()
  })

  it('refuses a path that is not under the base', async () => {
    expect(await resolveRealWriteTargetWithin(base, path.join(base, '..', 'x.md'))).toBeNull()
    expect(await resolveRealWriteTargetWithin(base, `${base}-sibling/x.md`)).toBeNull()
  })

  it('returns the target as given when the base does not exist yet', async () => {
    const missingBase = path.join(outside, 'not-yet')
    expect(await resolveRealWriteTargetWithin(missingBase, path.join(missingBase, 'a', 'b.md')))
      .toBe(path.join(missingBase, 'a', 'b.md'))
  })
})
