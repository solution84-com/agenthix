import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PACKAGE_MAX_BYTES } from '@agenthix/core'
import {
  storeVerifiedPackage, hasPackage, missingPackages, resolvePackage, listCachedPackages, packageDir,
  getPackageCacheRoot, sweepIncomingDir,
  PackageUnavailableError, PackageVerificationError,
} from '../packageCache'
import { makeTransfer } from './transferFixture'

let root: string
const savedRoot = process.env.SITE_ROOT
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
})
afterEach(async () => {
  if (savedRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedRoot
  await fs.rm(root, { recursive: true, force: true })
})

describe('package cache @SC-446', () => {
  it('stores verified content under packages/<digest>/files', async () => {
    const { ref, body } = makeTransfer('agent', 'agent-1', { 'instructions.md': 'Be brief.', 'skills/review/SKILL.md': 'r' })
    expect(await missingPackages([ref])).toEqual([ref.digest])
    await storeVerifiedPackage(ref, body)
    expect(packageDir(ref)).toBe(path.join(root, 'packages', ref.digest))
    expect(await fs.readFile(path.join(packageDir(ref), 'files', 'skills', 'review', 'SKILL.md'), 'utf-8')).toBe('r')
    expect(await hasPackage(ref)).toBe(true)
    expect(await missingPackages([ref])).toEqual([])
    expect(await fs.readdir(path.join(root, 'packages', '.incoming'))).toEqual([])
  })

  it('storing the same content twice is harmless', async () => {
    const { ref, body } = makeTransfer('platform', 'platform', { 'skills/a/SKILL.md': 'a' })
    await storeVerifiedPackage(ref, body)
    await expect(storeVerifiedPackage(ref, body)).resolves.toBeUndefined()
  })

  it('refuses a file that does not match its hash, a digest that does not match the contents, and a ref that is not the stream\'s', async () => {
    const { ref, body } = makeTransfer('org', 'org-1', { 'ORG.md': 'org' })
    const tampered = JSON.parse(body.toString())
    tampered.data['ORG.md'] = Buffer.from('evil').toString('base64')
    await expect(storeVerifiedPackage(ref, Buffer.from(JSON.stringify(tampered)))).rejects.toThrow(/does not match its hash/)

    const other = makeTransfer('org', 'org-1', { 'ORG.md': 'other' })
    await expect(storeVerifiedPackage({ ...ref, digest: other.ref.digest }, body)).rejects.toBeInstanceOf(PackageVerificationError)

    const wrongDigest = JSON.parse(body.toString())
    wrongDigest.ref.digest = 'f'.repeat(64)
    await expect(storeVerifiedPackage(wrongDigest.ref, Buffer.from(JSON.stringify(wrongDigest)))).rejects.toThrow(/digest does not match/)
    expect(await hasPackage(ref)).toBe(false)
  })

  it('refuses a path that could leave the package', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    const bad = JSON.parse(body.toString())
    bad.contents.files[0].path = '../../escape.md'
    bad.data = { '../../escape.md': bad.data['instructions.md'] }
    await expect(storeVerifiedPackage(ref, Buffer.from(JSON.stringify(bad)))).rejects.toThrow(/path/)
  })

  it('resolves cached content to its files and refuses one it does not hold', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    await expect(resolvePackage(ref)).rejects.toBeInstanceOf(PackageUnavailableError)
    await expect(resolvePackage(ref)).rejects.toThrow(/^package_unavailable: /)
    await storeVerifiedPackage(ref, body)
    expect(await resolvePackage(ref)).toBe(path.join(packageDir(ref), 'files'))
  })

  it('lists what it holds, with sizes and last use', async () => {
    const a = makeTransfer('agent', 'a1', { 'instructions.md': 'x'.repeat(100) })
    const b = makeTransfer('agent', 'a1', { 'instructions.md': 'y' })
    await storeVerifiedPackage(a.ref, a.body)
    await storeVerifiedPackage(b.ref, b.body)
    const listed = await listCachedPackages()
    expect(listed.map(c => c.digest).sort()).toEqual([a.ref.digest, b.ref.digest].sort())
    expect(listed.find(c => c.digest === a.ref.digest)!.bytes).toBeGreaterThan(listed.find(c => c.digest === b.ref.digest)!.bytes)
  })

  it('keys content by digest alone: two packages with identical content share one entry', async () => {
    const one = makeTransfer('agent', 'a1', { 'instructions.md': 'same' })
    const two = makeTransfer('agent', 'a2', { 'instructions.md': 'same' })
    await storeVerifiedPackage(one.ref, one.body)
    expect(await missingPackages([two.ref])).toEqual([])
    expect(packageDir(two.ref)).toBe(packageDir(one.ref))
  })

  it('ignores anything under the cache root that is not a digest entry, such as an earlier layout', async () => {
    await fs.mkdir(path.join(getPackageCacheRoot(), 'agent', 'a1', `1-${'c'.repeat(64)}`), { recursive: true })
    await fs.writeFile(path.join(getPackageCacheRoot(), 'agent', 'a1', `1-${'c'.repeat(64)}`, 'package.json'), '{}')
    expect(await listCachedPackages()).toEqual([])
  })

  // The decoded total, not just the encoded transfer size, is
  // bounded — a transfer could otherwise stay under the *2 encoded guard while
  // still decoding to more file bytes than any package may hold.
  it('refuses contents whose decoded file bytes exceed PACKAGE_MAX_BYTES', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'big.bin': 'x'.repeat(PACKAGE_MAX_BYTES + 1) })
    await expect(storeVerifiedPackage(ref, body)).rejects.toBeInstanceOf(PackageVerificationError)
    await expect(storeVerifiedPackage(ref, body)).rejects.toThrow(/larger than any package may be/)
    expect(await hasPackage(ref)).toBe(false)
  })

  // A null/non-object files entry must fail with
  // PackageVerificationError, never a raw TypeError from reading `.path`
  // off it.
  it('refuses a null or non-object entry in contents.files with PackageVerificationError, not a TypeError', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    const tampered = JSON.parse(body.toString())
    tampered.contents.files.push(null)
    const attempt = storeVerifiedPackage(ref, Buffer.from(JSON.stringify(tampered)))
    await expect(attempt).rejects.toBeInstanceOf(PackageVerificationError)
    await expect(attempt).rejects.not.toBeInstanceOf(TypeError)
  })

  // storeVerifiedPackage's rename fallback, finding a target
  // directory that exists without package.json, clears it and retries once
  // rather than throwing on the stale directory.
  it('clears a stale target directory without package.json and retries the rename once', async () => {
    const { ref, body } = makeTransfer('agent', 'a1', { 'instructions.md': 'x' })
    const final = packageDir(ref)
    await fs.mkdir(final, { recursive: true })
    await fs.writeFile(path.join(final, 'junk.txt'), 'leftover')
    await storeVerifiedPackage(ref, body)
    expect(await hasPackage(ref)).toBe(true)
    expect(await fs.readFile(path.join(final, 'files', 'instructions.md'), 'utf-8')).toBe('x')
  })

  // A leftover .incoming/<uuid> directory from a crash mid-put
  // is removed once it is old enough, and left alone while it could still be
  // a live put in progress.
  describe('sweepIncomingDir', () => {
    it('removes an entry older than maxAgeMs but leaves a fresh one alone', async () => {
      const incomingRoot = path.join(getPackageCacheRoot(), '.incoming')
      const stale = path.join(incomingRoot, 'stale-uuid')
      const fresh = path.join(incomingRoot, 'fresh-uuid')
      await fs.mkdir(stale, { recursive: true })
      await fs.mkdir(fresh, { recursive: true })
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
      await fs.utimes(stale, old, old)

      expect(await sweepIncomingDir(60 * 60 * 1000)).toBe(1)
      expect(await fs.readdir(incomingRoot)).toEqual(['fresh-uuid'])
    })

    it('removes everything unconditionally when called with maxAgeMs 0, as boot does', async () => {
      const incomingRoot = path.join(getPackageCacheRoot(), '.incoming')
      await fs.mkdir(path.join(incomingRoot, 'leftover'), { recursive: true })
      expect(await sweepIncomingDir(0)).toBe(1)
      expect(await fs.readdir(incomingRoot)).toEqual([])
    })
  })
})
