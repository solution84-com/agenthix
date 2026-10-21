import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { packageDigestInput, MAX_SKILL_SLUG_LENGTH } from '@agenthix/core'
import { prisma } from '../../test/db'

// The package store against the real test DB (ADR-0094): one current content per package, named by digest.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import {
  writePackage, getCurrentPackage, readPackage, readCurrentFiles, deletePackage,
  toTransfer, contentsFor, computePackageDigest, sha256Hex,
  PackageContentError, PackageWriteConflictError, PackageNotFoundError,
  type Db,
} from '../packageStore'

const files = () => [
  { path: 'instructions.md', content: Buffer.from('Be helpful.\n') },
  { path: 'skills/review/SKILL.md', content: Buffer.from('---\nname: review\n---\n') },
]

describe('packageStore (ADR-0072: one current definition, named by digest)', () => {
  it('computes the digest as sha256 over core\'s digest input', () => {
    const contents = contentsFor(files())
    expect(computePackageDigest(contents)).toBe(createHash('sha256').update(packageDigestInput(contents)).digest('hex'))
    expect(contents.files[0]).toEqual({ path: 'instructions.md', sha256: sha256Hex(Buffer.from('Be helpful.\n')) })
  })

  it('an edit moves the package to new content — one package row, a new digest, no version number', async () => {
    const first = await writePackage({ kind: 'agent', key: 'agent-1', files: files(), updatedById: 'u1' })
    expect(first.changed).toBe(true)
    expect(first.ref).toEqual({ kind: 'agent', key: 'agent-1', digest: first.ref.digest })
    const edited = [{ path: 'instructions.md', content: Buffer.from('Be brief.\n') }]
    const second = await writePackage({ kind: 'agent', key: 'agent-1', files: edited, updatedById: 'u2' })
    expect(second.changed).toBe(true)
    expect(second.ref.digest).not.toBe(first.ref.digest)
    expect(await prisma.package.count()).toBe(1)
    const held = await prisma.packageContent.findMany()
    expect(held.map(c => c.digest).sort()).toEqual([first.ref.digest, second.ref.digest].sort())
    expect(await getCurrentPackage('agent', 'agent-1')).toEqual({ ref: second.ref, updatedById: 'u2' })
    expect((await readCurrentFiles('agent', 'agent-1'))!.map(f => f.content.toString())).toEqual(['Be brief.\n'])
    expect(held.find(c => c.digest === first.ref.digest)!.releasedAt).not.toBeNull()
  })

  it('changes nothing — not even who last changed it — when the content is identical', async () => {
    const first = await writePackage({ kind: 'agent', key: 'agent-1', files: files(), updatedById: 'u1' })
    const again = await writePackage({ kind: 'agent', key: 'agent-1', files: files().reverse(), updatedById: 'u2' })
    expect(again).toEqual({ ref: first.ref, changed: false })
    expect((await getCurrentPackage('agent', 'agent-1'))!.updatedById).toBe('u1')
  })

  it('refuses an unsafe path, a duplicate path and content over the limit, storing nothing', async () => {
    await expect(writePackage({ kind: 'org', key: 'o1', files: [{ path: '../x', content: Buffer.from('') }], updatedById: null }))
      .rejects.toBeInstanceOf(PackageContentError)
    await expect(writePackage({ kind: 'org', key: 'o1', files: [files()[0], files()[0]], updatedById: null }))
      .rejects.toThrow(/twice/)
    await expect(writePackage({ kind: 'org', key: 'o1', files: [{ path: 'big.md', content: Buffer.alloc(8 * 1024 * 1024 + 1) }], updatedById: null }))
      .rejects.toThrow(/limit/)
    expect(await prisma.package.count()).toBe(0)
    expect(await prisma.packageContent.count()).toBe(0)
  })

  it('refuses a path that is both a file and the directory of another file, in either order', async () => {
    const pair = [{ path: 'skills/x', content: Buffer.from('file') }, { path: 'skills/x/SKILL.md', content: Buffer.from('skill') }]
    await expect(writePackage({ kind: 'org', key: 'o1', files: pair, updatedById: null }))
      .rejects.toThrow(/skills\/x is also a directory/)
    await expect(writePackage({ kind: 'org', key: 'o1', files: [...pair].reverse(), updatedById: null }))
      .rejects.toBeInstanceOf(PackageContentError)
    expect(await prisma.package.count()).toBe(0)
  })

  it('refuses a skill whose slug no site can stage — invalid characters or longer than the slug limit', async () => {
    const skill = (slug: string) => [{ path: `skills/${slug}/SKILL.md`, content: Buffer.from('s') }]
    await expect(writePackage({ kind: 'org', key: 'o1', files: skill('Bad_Slug'), updatedById: null }))
      .rejects.toThrow(/Skill slug "Bad_Slug"/)
    await expect(writePackage({ kind: 'platform', key: 'platform', files: skill('a'.repeat(MAX_SKILL_SLUG_LENGTH + 1)), updatedById: null }))
      .rejects.toBeInstanceOf(PackageContentError)
    const ok = await writePackage({ kind: 'platform', key: 'platform', files: skill('a'.repeat(MAX_SKILL_SLUG_LENGTH)), updatedById: null })
    expect(ok.changed).toBe(true)
  })

  // Another writer lands between this writer's read and its write: the other write is made through the real
  // client at the moment the guarded statement would run, so the database itself decides the outcome.
  function racedBy(table: 'create' | 'updateMany', other: () => Promise<unknown>): Db {
    const pkg = prisma.package
    return {
      ...prisma,
      package: {
        findUnique: pkg.findUnique.bind(pkg),
        create: async (args: any) => { if (table === 'create') await other(); return pkg.create(args) },
        updateMany: async (args: any) => { if (table === 'updateMany') await other(); return pkg.updateMany(args) },
      },
    } as unknown as Db
  }

  it('reports a concurrent first write as a conflict rather than a raw database error', async () => {
    const other = () => writePackage({ kind: 'platform', key: 'platform', files: [files()[1]], updatedById: 'other' })
    await expect(writePackage({ kind: 'platform', key: 'platform', files: files(), updatedById: null }, racedBy('create', other)))
      .rejects.toBeInstanceOf(PackageWriteConflictError)
    expect((await getCurrentPackage('platform', 'platform'))!.updatedById).toBe('other')
  })

  it('reports a concurrent edit as a conflict and leaves the other writer\'s content current', async () => {
    await writePackage({ kind: 'platform', key: 'platform', files: files(), updatedById: null })
    const other = () => writePackage({ kind: 'platform', key: 'platform', files: [files()[1]], updatedById: 'other' })
    await expect(writePackage({ kind: 'platform', key: 'platform', files: [files()[0]], updatedById: null }, racedBy('updateMany', other)))
      .rejects.toBeInstanceOf(PackageWriteConflictError)
    const current = (await readCurrentFiles('platform', 'platform'))!
    expect(current.map(f => f.path)).toEqual(['skills/review/SKILL.md'])
  })

  it('reads back exactly the content a ref names, and builds a transfer that verifies against it', async () => {
    const { ref } = await writePackage({ kind: 'agent', key: 'agent-1', files: files(), updatedById: null })
    const transfer = toTransfer(ref, await readPackage(ref))
    expect(transfer.ref).toEqual(ref)
    expect(transfer.data['instructions.md']).toBe(Buffer.from('Be helpful.\n').toString('base64'))
    expect(computePackageDigest(transfer.contents)).toBe(ref.digest)
  })

  it('still serves the content a ref names after an edit has moved the package on — content is never changed', async () => {
    const { ref } = await writePackage({ kind: 'agent', key: 'agent-1', files: files(), updatedById: null })
    await writePackage({ kind: 'agent', key: 'agent-1', files: [files()[0]], updatedById: null })
    const loaded = await readPackage(ref)
    expect(loaded.files.map(f => f.path)).toEqual(['instructions.md', 'skills/review/SKILL.md'])
    expect(computePackageDigest(toTransfer(ref, loaded).contents)).toBe(ref.digest)
  })

  it('refuses a ref whose content hq no longer holds', async () => {
    await expect(readPackage({ kind: 'agent', key: 'agent-1', digest: 'f'.repeat(64) })).rejects.toBeInstanceOf(PackageNotFoundError)
  })

  it('has no current files for a package that was never written', async () => {
    expect(await getCurrentPackage('agent', 'never')).toBeNull()
    expect(await readCurrentFiles('agent', 'never')).toBeNull()
  })

  it('shares one content row between packages with identical content, and reuses it when an edit goes back', async () => {
    const a = await writePackage({ kind: 'agent', key: 'a1', files: files(), updatedById: null })
    await writePackage({ kind: 'agent', key: 'a2', files: files(), updatedById: null })
    expect(await prisma.packageContent.count()).toBe(1)
    await writePackage({ kind: 'agent', key: 'a1', files: [files()[0]], updatedById: null })
    const back = await writePackage({ kind: 'agent', key: 'a1', files: files(), updatedById: null })
    expect(back.ref.digest).toBe(a.ref.digest)
    expect(await prisma.packageContent.count()).toBe(2)
    expect((await prisma.packageContent.findUnique({ where: { digest: a.ref.digest } }))!.releasedAt).toBeNull()
  })

  it('deletes a package but releases its content rather than deleting it, and deleting one that does not exist is not an error', async () => {
    const { ref } = await writePackage({ kind: 'agent', key: 'agent-1', files: files(), updatedById: null })
    await deletePackage('agent', 'agent-1')
    expect(await getCurrentPackage('agent', 'agent-1')).toBeNull()
    expect((await prisma.packageContent.findUnique({ where: { digest: ref.digest } }))!.releasedAt).not.toBeNull()
    await expect(readPackage(ref)).resolves.toBeDefined()
    await expect(deletePackage('agent', 'never')).resolves.toBeUndefined()
  })
})
