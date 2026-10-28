import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../content', () => ({
  readContent: async () => [{ path: 'SKILL.md', content: Buffer.from('---\nname: code-review\ndescription: Reviews a change.\n---\n# Code Review\n') }],
}))

import { assetRelatives } from '../relatives'

const line = { skill: 'agenthix/code-review', version: '2.0.0', fingerprint: 'sha256:x', copied: '2026-10-27', recorded: 'hq' }
const original = {
  id: 'o', kind: 'SKILL', publisher: 'agenthix', name: 'code-review', builtIn: false, removedAt: null as Date | null, setAsideById: 'c' as string | null,
  currentVersion: { version: '2.1.0', digest: 'd', source: 'BUILT_IN', trustedPublisher: null },
}
const copy = { id: 'c', publisher: 'fernhill', name: 'code-review', currentVersion: { version: '2.0.1' }, draft: { revisions: [{ authorId: 'u1' }] } }

function dbOf(over: { original?: Partial<typeof original>; versions?: number } = {}) {
  const o = { ...original, ...over.original }
  return {
    assetVersion: {
      findFirst: async ({ where }: { where: { assetId: string } }) => (where.assetId === 'c' ? { basedOn: [line] } : { basedOn: [] }),
      count: async () => over.versions ?? 2,
    },
    asset: {
      findUnique: async ({ where }: { where: { id?: string; kind_publisher_name?: object } }) => (where.kind_publisher_name || where.id === 'o' ? o : null),
      findMany: async ({ where }: { where: { id?: unknown; publisher?: string } }) => (where.publisher ? [{ id: 'c' }] : [copy]),
    },
    user: { findMany: async () => [{ id: 'u1', displayName: 'Sam', avatarUrl: null, deactivatedAt: null, erasedAt: null, auth: null }] },
  } as never
}

describe('a copy and its original on each other’s page @SC-1628', () => {
  it("shows the copy the original it replaced: its identity, version, signer and the version copied", async () => {
    const r = await assetRelatives(dbOf(), { id: 'c' }, true, 'fernhill')
    expect(r.copies).toEqual([])
    expect(r.original).toEqual({
      assetId: 'o', identity: 'agenthix/code-review', name: "Agenthix's Code Review", version: '2.1.0', copiedFrom: '2.0.0',
      signedBy: 'Signed by Agenthix', inUse: false, copyPublished: true,
    })
  })

  it('says the original is in use again once switched back', async () => {
    const r = await assetRelatives(dbOf({ original: { setAsideById: null } }), { id: 'c' }, true, 'fernhill')
    expect(r.original).toMatchObject({ inUse: true, copyPublished: true })
  })

  it('shows no original once it is removed from the Library', async () => {
    const r = await assetRelatives(dbOf({ original: { removedAt: new Date() } }), { id: 'c' }, true, 'fernhill')
    expect(r.original).toBeNull()
  })

  it("shows the original its copies, which one is in use and whose draft is open", async () => {
    const r = await assetRelatives(dbOf(), { id: 'o' }, false, 'fernhill')
    expect(r.original).toBeNull()
    expect(r.copies).toEqual([{ assetId: 'c', identity: 'fernhill/code-review', version: '2.0.1', inUse: true, published: true, draftBy: 'Sam' }])
  })

  it('a copy never published is not in use and not published', async () => {
    const r = await assetRelatives(dbOf({ original: { setAsideById: null }, versions: 1 }), { id: 'o' }, false, 'fernhill')
    expect(r.copies[0]).toMatchObject({ inUse: false, published: false })
  })
})
