import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../content', () => ({
  readContent: async () => [{ path: 'SKILL.md', content: Buffer.from('---\nname: code-review\ndescription: Reviews a change.\n---\n# Code Review\n') }],
}))

import { assetPageView, signedByWords } from '../pageView'
import type { PersonActor } from '../../../policy'

const person = (over: Partial<PersonActor>): PersonActor => ({ kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: false, projectRole: null, ...over })
const admin = person({ role: 'ADMIN' })
const maintainer = person({ libraryMaintainer: true })
const member = person({})

const user = (id: string, name: string) => ({ id, displayName: name, avatarUrl: null, deactivatedAt: null, erasedAt: null, auth: null })

function dbOf(over: { asset?: object; versions?: object[] } = {}) {
  const asset = {
    id: 'a1', kind: 'SKILL', publisher: 'acme', name: 'code-review', builtIn: false, switchedOff: false, givenToAll: false,
    currentVersionId: 'v1', suitedTo: [], removedAt: null,
    currentVersion: { id: 'v1', version: '1.3.0', digest: 'd1', source: 'URL', sourceUrl: 'https://github.com/acme/skills/releases/download/v1.3/code-review.zip', trustedPublisher: { displayName: 'Acme', repository: 'https://github.com/acme/skills' } },
    versions: [
      { id: 'v1', version: '1.3.0', withdrawn: false, byId: 'u3', createdAt: new Date('2026-10-24T10:00:00Z') },
      { id: 'v2', version: '1.4.0', withdrawn: false, byId: null, createdAt: new Date('2026-10-26T10:00:00Z') },
    ],
    setAsideBy: null, draft: null, ...over.asset,
  }
  return {
    asset: { findUnique: async () => asset, findUniqueOrThrow: async () => asset },
    org: { findFirst: async () => ({ publisherName: 'fernhill', outsideInstallers: 'ADMINS' }) },
    assetPinChange: { findMany: async () => [{ byId: 'u3' }] },
    user: { findMany: async () => [user('u3', 'Avery Chen')] },
    libraryMaintainer: { findMany: async () => [{ user: user('u4', 'Lee Park') }] },
    agent: { findMany: async () => [{ id: 'g1', name: 'Ada' }], findUnique: async () => ({ name: 'Ada' }) },
    project: { findUnique: async () => ({ id: 'p1', name: 'Website rebuild' }), findFirst: async () => null },
  } as never
}

describe("an asset's page", () => {
  it('says what it is, who signed it, where it came from, who installed it and the update offered', async () => {
    const page = await assetPageView(dbOf(), admin, 'a1')
    expect(page).toMatchObject({
      kind: 'skill', title: 'Code Review', description: 'Reviews a change.', identity: 'acme/code-review', version: '1.3.0',
      signedBy: 'Signed by Acme (github.com/acme/skills)', source: 'A link', installedBy: 'Avery Chen', own: false, unsigned: false,
      update: { versionId: 'v2', version: '1.4.0' }, maintainers: ['Lee Park'],
    })
    expect(page.names).toEqual({ u3: 'Avery Chen' })
  })

  it('offers an administrator everything, a Library maintainer editing and updating but not choosing agents or removing, and a member nothing', async () => {
    expect((await assetPageView(dbOf(), admin, 'a1')).can).toEqual({ edit: true, update: true, grant: true, remove: true })
    expect((await assetPageView(dbOf(), maintainer, 'a1')).can).toEqual({ edit: true, update: true, grant: false, remove: false })
    expect((await assetPageView(dbOf(), member, 'a1')).can).toEqual({ edit: false, update: false, grant: false, remove: false })
  })

  it('lists the agents to choose from only for someone who may choose', async () => {
    expect((await assetPageView(dbOf(), admin, 'a1')).agents).toEqual([{ id: 'g1', name: 'Ada' }])
    expect((await assetPageView(dbOf(), maintainer, 'a1')).agents).toEqual([])
  })

  it("shows the organisation's own copy as made here, and an unsigned upload as unsigned", async () => {
    const own = await assetPageView(dbOf({ asset: { publisher: 'fernhill', currentVersion: { id: 'v1', version: '2.0.0', digest: 'd', source: 'MADE_HERE', sourceUrl: null, trustedPublisher: null } } }), admin, 'a1')
    expect(own).toMatchObject({ own: true, unsigned: false, signedBy: expect.stringContaining('Made here') })
    const unsigned = await assetPageView(dbOf({ asset: { publisher: 'unsigned', currentVersion: { id: 'v1', version: '1.0.0', digest: 'd', source: 'UPLOAD', sourceUrl: null, trustedPublisher: null } } }), admin, 'a1')
    expect(unsigned).toMatchObject({ unsigned: true, signedBy: expect.stringContaining('Unsigned') })
  })

  it('names the copy that replaced it when it is set aside, and cannot be edited when built in', async () => {
    const page = await assetPageView(dbOf({ asset: { setAsideBy: { id: 'c1', publisher: 'fernhill', name: 'code-review' } } }), admin, 'a1')
    expect(page.setAsideFor).toEqual({ assetId: 'c1', identity: 'fernhill/code-review' })
    const builtIn = await assetPageView(dbOf({ asset: { builtIn: true, publisher: 'agenthix' } }), admin, 'a1')
    expect(builtIn.can.edit).toBe(false)
    expect(builtIn.can.remove).toBe(false)
  })

  it('refuses someone with no role in the organisation', async () => {
    await expect(assetPageView(dbOf(), person({ role: null }), 'a1')).rejects.toMatchObject({ status: 403 })
  })
})

describe('who vouches for it, in words', () => {
  it('says signed by Agenthix for the image, and never claims more for a built-in', () => {
    expect(signedByWords({ source: 'BUILT_IN', trustedPublisher: null }, 'agenthix', false, false)).toBe('Signed by Agenthix')
    expect(signedByWords({ source: 'BUILT_IN', trustedPublisher: null }, 'agenthix', true, false)).toContain('Built in')
  })

  it('hides an update skipped until a later version is held (UQ10)', async () => {
    expect((await assetPageView(dbOf({ asset: { skippedVersion: '1.4.0' } }), admin, 'a1')).update).toBeNull()
    expect((await assetPageView(dbOf({ asset: { skippedVersion: '1.3.5' } }), admin, 'a1')).update).toMatchObject({ version: '1.4.0' })
  })

  it('says who used it last and when, and where only to a viewer who sees that place (UQ4)', async () => {
    const used = { lastUsedAt: new Date('2026-10-27T11:05:00Z'), lastUsedAgentId: 'g1', lastUsedPlaceType: 'project', lastUsedPlaceId: 'p1' }
    expect((await assetPageView(dbOf({ asset: used }), member, 'a1', async () => true)).lastUsed)
      .toEqual({ by: 'Ada', at: '2026-10-27T11:05:00.000Z', where: 'Website rebuild' })
    expect((await assetPageView(dbOf({ asset: used }), member, 'a1', async () => false)).lastUsed)
      .toEqual({ by: 'Ada', at: '2026-10-27T11:05:00.000Z', where: null })
    expect((await assetPageView(dbOf(), member, 'a1')).lastUsed).toBeNull()
  })
})
