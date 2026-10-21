import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveRealPathWithin } from '../realPathWithin'

let base: string
let outside: string

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'real-within-base-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'real-within-outside-'))
  await fs.mkdir(path.join(base, 'docs'))
  await fs.writeFile(path.join(base, 'docs', 'inner.md'), 'inner')
  await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
  await fs.symlink('docs/inner.md', path.join(base, 'inside-link.md'))
  await fs.symlink(path.relative(base, path.join(outside, 'secret.md')), path.join(base, 'relative-out.md'))
  await fs.symlink(path.join(outside, 'secret.md'), path.join(base, 'absolute-out.md'))
  await fs.symlink(path.join(base, 'missing.md'), path.join(base, 'dangling.md'))
})

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('resolveRealPathWithin', () => {
  it('returns the real path of a file inside the base', async () => {
    expect(await resolveRealPathWithin(base, path.join(base, 'docs', 'inner.md')))
      .toBe(await fs.realpath(path.join(base, 'docs', 'inner.md')))
  })

  it('follows a link that stays inside the base', async () => {
    expect(await resolveRealPathWithin(base, path.join(base, 'inside-link.md')))
      .toBe(await fs.realpath(path.join(base, 'docs', 'inner.md')))
  })

  it('refuses a relative link that leaves the base', async () => {
    expect(await resolveRealPathWithin(base, path.join(base, 'relative-out.md'))).toBeNull()
  })

  it('refuses an absolute link that leaves the base', async () => {
    expect(await resolveRealPathWithin(base, path.join(base, 'absolute-out.md'))).toBeNull()
  })

  it('returns null for a dangling link and for a missing path', async () => {
    expect(await resolveRealPathWithin(base, path.join(base, 'dangling.md'))).toBeNull()
    expect(await resolveRealPathWithin(base, path.join(base, 'nope.md'))).toBeNull()
  })

  it('refuses a sibling directory whose name starts with the base name', async () => {
    const sibling = `${base}-sibling`
    await fs.mkdir(sibling, { recursive: true })
    try {
      expect(await resolveRealPathWithin(base, sibling)).toBeNull()
    } finally {
      await fs.rm(sibling, { recursive: true, force: true })
    }
  })
})
