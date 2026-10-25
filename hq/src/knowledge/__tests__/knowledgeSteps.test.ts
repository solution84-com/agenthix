/**
 * What the knowledge tools tell a conversation's work step (agent knowledge spec, part 5, C1–C3): a change with its
 * versions for *See change* and *Undo*, the levels a search covered, the guide's page a read used. Only a reach that
 * asks (a conversation's turn) is told; a run's is not.
 */
import { describe, expect, it } from 'vitest'
import type { KnowledgeOwnerRef, KnowledgeStepView } from '@agenthix/core'
import { versionOf } from '@agenthix/core/file-tools'
import { createKnowledgeService } from '../service'
import type { KnowledgeReach } from '../reach'
import { fakeDeps } from './fakeKnowledgeDeps'

const WEB: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-web' }
const PAGE = '---\ntitle: Release process\n---\nStaging deploys go out after the checks pass.\n'
const v = (t: string) => versionOf(Buffer.from(t, 'utf8'))

let n = 0
function setup() {
  const f = fakeDeps()
  f.sites.put(WEB, 'processes/release.md', PAGE)
  const told: KnowledgeStepView[] = []
  const reach = (asks = true): KnowledgeReach => ({
    places: [{ level: 'website-rebuild', owner: WEB }],
    userId: 'u1',
    agent: { agentId: 'kernel', conversationId: 'c1' },
    mayChange: true,
    callerKey: `conv-${++n}`,
    ...(asks ? { onStep: (s: KnowledgeStepView) => told.push(s) } : {}),
  })
  return { ...f, told, reach, service: createKnowledgeService(f.deps) }
}

describe('a change @SC-1414', () => {
  it("an edit tells the page, its title, the new version and the one Undo restores, with what changed in a line", async () => {
    const { service, told, reach } = setup()
    await service.editKnowledge(reach(), { page: 'website-rebuild:processes/release.md', old_string: 'after the checks pass', new_string: "once Mia approves\nin the channel" })
    const after = PAGE.replace('after the checks pass', "once Mia approves\nin the channel")
    expect(told).toEqual([{
      kind: 'knowledge_change', level: 'website-rebuild', owner: WEB, page: 'processes/release.md', title: 'Release process',
      change: 'edited', versionId: v(after), previousVersionId: 'k2', summary: 'Now says "once Mia approves"',
    }])
  })

  it('a new page is told with its title, and with nothing to undo to', async () => {
    const { service, told, reach } = setup()
    await service.writeKnowledge(reach(), { page: 'website-rebuild:how-we-deploy.md', content: '---\ntitle: How we deploy\n---\nBy hand.\n' })
    expect(told).toEqual([expect.objectContaining({ change: 'created', title: 'How we deploy', summary: 'New page' })])
    expect(told[0]).not.toHaveProperty('previousVersionId')
  })

  it('a delete is told with the version Restore brings back, and no version of its own', async () => {
    const { service, told, reach } = setup()
    await service.deleteKnowledge(reach(), { page: 'website-rebuild:processes/release.md' })
    expect(told).toEqual([expect.objectContaining({ change: 'deleted', previousVersionId: 'k-del' })])
    expect(told[0]).not.toHaveProperty('versionId')
  })

  it('a change the gate refused tells nothing', async () => {
    const { service, told, reach } = setup()
    await service.editKnowledge(reach(), { page: 'website-rebuild:processes/release.md', old_string: 'nowhere', new_string: 'x' })
    expect(told).toEqual([])
  })

  it("a run's reach is not told, and its edit reads nothing back", async () => {
    const { service, told, reach, sites } = setup()
    await service.editKnowledge(reach(false), { page: 'website-rebuild:processes/release.md', old_string: 'after the checks pass', new_string: 'x' })
    expect(told).toEqual([])
    expect(sites.calls.filter(c => c.method === 'read')).toEqual([])
  })
})

describe('a search and a read @SC-1414', () => {
  it('a search refused before it reached any level is told as one that covered nothing: out of reach, invalid, or over the rate (F11)', async () => {
    const { service, told, reach } = setup()
    const nothing = { kind: 'knowledge_search', levels: [], names: [] }
    await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'shop' })
    expect(told).toEqual([nothing])
    told.length = 0
    await service.searchKnowledge(reach(), { pattern: 42 })
    await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'org', path: 'website-rebuild:processes' })
    expect(told).toEqual([nothing, nothing])
    told.length = 0
    const one = reach()
    for (let i = 0; i < 40; i++) await service.searchKnowledge(one, { pattern: 'staging', scope: 'org' })
    expect(told.at(-1)).toEqual(nothing)
  })

  it('a search tells the levels it covered, in order', async () => {
    const { service, told, reach } = setup()
    await service.searchKnowledge(reach(), { pattern: 'staging' })
    expect(told).toEqual([{ kind: 'knowledge_search', levels: ['website-rebuild', 'org', 'platform'], names: ['website-rebuild', 'org', 'platform'] }])
  })

  it('a search with a scope tells the one level', async () => {
    const { service, told, reach } = setup()
    await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'org' })
    expect(told).toEqual([expect.objectContaining({ levels: ['org'] })])
  })

  it("a read of the guide tells the guide's page and its title; a place's page tells nothing", async () => {
    const { service, told, reach } = setup()
    await service.readKnowledge(reach(), { page: 'platform:your-tools/providers.md' })
    await service.readKnowledge(reach(), { page: 'website-rebuild:processes/release.md' })
    expect(told).toEqual([{ kind: 'platform_page', page: 'your-tools/providers.md', title: 'your-tools/providers.md' }])
  })
})
