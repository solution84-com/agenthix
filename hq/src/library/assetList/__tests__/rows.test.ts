import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../assets/content', () => ({
  readContent: async () => [{ path: 'SKILL.md', content: Buffer.from('---\nname: code-review\ndescription: Reviews a change before it merges.\n---\n# Code Review\n') }],
}))

import { libraryRows } from '../rows'
import type { PersonActor } from '../../../assets/policy'

const member: PersonActor = { kind: 'person', userId: 'u1', role: 'MEMBER', libraryMaintainer: false, projectRole: null }
const admin: PersonActor = { ...member, userId: 'u2', role: 'ADMIN' }

const version = (over: object = {}) => ({
  version: '1.3.0', digest: 'd1', source: 'UPLOAD', trustedPublisher: { displayName: 'Acme', repository: 'https://github.com/acme/skills' },
  _count: { agentsMade: 0, boardsMade: 0, teamsMade: 0 }, ...over,
})
const asset = (over: object = {}) => ({
  id: 'a1', kind: 'SKILL', publisher: 'acme', name: 'code-review', builtIn: false, switchedOff: false, givenToAll: false,
  currentVersion: version(), versions: [{ version: '1.3.0', withdrawn: false }], grants: [], setAsideBy: null, draft: null, ...over,
})

function dbOf(assets: object[], proposals: object[] = []) {
  return {
    asset: { findMany: async () => assets },
    proposal: { findMany: async () => proposals },
    org: { findFirst: async () => ({ publisherName: 'fernhill' }) },
    user: { findMany: async () => [{ id: 'u1', displayName: 'Avery Chen', avatarUrl: null, deactivatedAt: null, erasedAt: null, auth: null }, { id: 'u3', displayName: 'Sam', avatarUrl: null, deactivatedAt: null, erasedAt: null, auth: null }] },
    agent: { findMany: async () => [{ id: 'g1', name: 'Ada' }] },
  } as never
}

describe('the Library’s rows @SC-1630', () => {
  it('names a skill by its SKILL.md, its identity and version, who signed it, and that no agent has it', async () => {
    const [r] = await libraryRows(dbOf([asset()]), member)
    expect(r).toMatchObject({
      kind: 'skill', title: 'Code Review', description: 'Reviews a change before it merges.', identity: 'acme/code-review', version: '1.3.0',
      signer: 'Signed by Acme (github.com/acme/skills)', has: 'No agent has it yet', statuses: ['noAgent'],
    })
  })

  it('says who has it: every agent, or the agents named', async () => {
    const rows = await libraryRows(dbOf([
      asset({ id: 'x', name: 'every', givenToAll: true }),
      asset({ id: 'y', name: 'some', grants: [{ agent: { name: 'Priya' } }, { agent: { name: 'Ada' } }] }),
    ]), member)
    expect(rows.find(r => r.assetId === 'x')).toMatchObject({ has: 'Every agent has it', statuses: [] })
    expect(rows.find(r => r.assetId === 'y')).toMatchObject({ has: 'Ada and Priya have it', statuses: [] })
  })

  it('marks an update only for a newer version that was not withdrawn', async () => {
    const [r] = await libraryRows(dbOf([asset({ versions: [
      { version: '1.3.0', withdrawn: false }, { version: '1.4.0', withdrawn: false }, { version: '2.0.0', withdrawn: true },
    ] })]), member)
    expect(r!.updateTo).toBe('1.4.0')
    expect(r!.statuses).toContain('update')
  })

  it('shows who a draft is by, an unsigned upload, made here, and a set-aside original', async () => {
    const rows = await libraryRows(dbOf([
      asset({ id: 'd', name: 'drafted', draft: { revisions: [{ authorId: 'u3' }] } }),
      asset({ id: 'u', name: 'loose', publisher: 'unsigned', currentVersion: version({ trustedPublisher: null }) }),
      asset({ id: 'm', name: 'mine', publisher: 'fernhill', currentVersion: version({ source: 'MADE_HERE', trustedPublisher: null }) }),
      asset({ id: 's', name: 'old', setAsideBy: { publisher: 'fernhill', name: 'old' } }),
    ]), member)
    const by = (id: string) => rows.find(r => r.assetId === id)!
    expect(by('d')).toMatchObject({ draftBy: 'Sam' })
    expect(by('d').statuses).toContain('draft')
    expect(by('u')).toMatchObject({ signer: 'Unsigned', identity: 'unsigned/loose' })
    expect(by('u').statuses).toContain('unsigned')
    expect(by('m').signer).toBe('Made here')
    expect(by('s')).toMatchObject({ setAsideFor: 'fernhill/old' })
    expect(by('s').statuses).toContain('setAside')
    expect(by('s').statuses).not.toContain('noAgent')
  })

  it('lists built-in skills first, with their switch, and a template with what was made from it', async () => {
    const rows = await libraryRows(dbOf([
      asset({ id: 'b', kind: 'BOARD', name: 'sprint-board', publisher: 'agenthix', currentVersion: version({ source: 'BUILT_IN', _count: { agentsMade: 0, boardsMade: 2, teamsMade: 0 } }) }),
      asset({ id: 'g', name: 'working-with-git', publisher: 'agenthix', builtIn: true, switchedOff: true, currentVersion: version({ source: 'BUILT_IN' }) }),
    ]), member)
    expect(rows[0]).toMatchObject({ assetId: 'g', signer: 'Built in', builtIn: true, switchedOff: true })
    expect(rows[1]).toMatchObject({ kind: 'board', title: 'Sprint board', has: 'Used by 2 projects', signer: 'Signed by Agenthix' })
  })

  it('shows an open organisation proposal to its proposer and to those who review, to no one else', async () => {
    const proposal = { id: 'p1', name: 'accessibility-check', description: 'Checks a page', assetId: null, agentId: 'g1', forUserId: 'u1' }
    const asMember = (userId: string) => libraryRows(dbOf([], [proposal]), { ...member, userId })
    expect((await asMember('u1')).map(r => r.proposalId)).toEqual(['p1'])
    expect(await asMember('u9')).toEqual([])
    const [r] = await libraryRows(dbOf([], [proposal]), admin)
    expect(r).toMatchObject({ key: 'proposal:p1', title: 'Accessibility check', statuses: ['waiting'], proposedBy: 'Proposed by Ada for Avery Chen' })
  })
})
