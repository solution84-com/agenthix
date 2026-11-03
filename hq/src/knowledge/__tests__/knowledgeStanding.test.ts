/**
 * A place's knowledge is read by the person's standing in it at each call, not when the run or turn began (agent
 * knowledge spec, part 4, *Who reaches what*; adr-0102): a member reads a project's pages, only a Member or Admin
 * changes them, and a place the person has lost is not reached at all.
 */
import { describe, expect, it } from 'vitest'
import { type KnowledgeOwnerRef } from '@agenthix/core'
import { createKnowledgeService } from '../service'
import type { KnowledgeReach } from '../reach'
import { fakeDeps } from './fakeKnowledgeDeps'

const OWN: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-own' }
const ADDED: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-added' }
const PAGE = '---\ntitle: Release\n---\nStaging deploys go out after the checks pass.\n'

let n = 0
const conversation = (over: Partial<KnowledgeReach> = {}): KnowledgeReach => ({
  places: [{ level: 'own', owner: OWN }, { level: 'added', owner: ADDED }],
  userId: 'viv',
  agent: { agentId: 'kernel', conversationId: 'c1' },
  mayChange: true,
  callerKey: `conv-${++n}`,
  ...over,
})
const run = (over: Partial<KnowledgeReach> = {}): KnowledgeReach =>
  conversation({ places: [{ level: 'own', owner: OWN }], agent: { agentId: 'kernel', runId: 'r1' }, ...over })

function setup() {
  const f = fakeDeps()
  f.sites.put(OWN, 'release.md', PAGE)
  f.sites.put(ADDED, 'release.md', PAGE)
  return { ...f, service: createKnowledgeService(f.deps) }
}

describe('a place\'s standing, at each call', () => {
  it('lets a Viewer of an added place read it and change nothing there, asking no site to change @SC-1404', async () => {
    const { service, sites, standings, records } = setup()
    standings.set('project:p-added|viv', 'reads')
    const r = conversation()
    expect(await service.readKnowledge(r, { page: 'added:release.md' })).toContain('Staging deploys')
    for (const refused of [
      await service.writeKnowledge(r, { page: 'added:release.md', content: '---\ntitle: X\n---\n' }),
      await service.editKnowledge(r, { page: 'added:release.md', old_string: 'Staging', new_string: 'Prod' }),
      await service.deleteKnowledge(r, { page: 'added:release.md' }),
    ]) {
      expect(refused).toBe(
        'added: is a project the person this acts for only reads: a Viewer reads its knowledge and changes nothing. ' +
        'Tell the person what should change, and one of its Members or Admins can change it. Nothing was changed.',
      )
    }
    expect(sites.calls.filter(c => c.method !== 'read')).toEqual([])
    expect(sites.text(ADDED, 'release.md')).toBe(PAGE)
    expect(records).toEqual([])
    // The conversation's own place, where they work, still changes.
    expect(await service.editKnowledge(r, { page: 'own:release.md', old_string: 'Staging', new_string: 'Prod' })).toContain('Done: own:release.md edited.')
  })

  it('re-checks a run\'s place at every call: demoted to Viewer, its next change is refused; removed, its place is gone @SC-1404', async () => {
    const { service, standings } = setup()
    const r = run()
    expect(await service.editKnowledge(r, { page: 'own:release.md', old_string: 'Staging', new_string: 'Stage' })).toContain('Done:')
    standings.set('project:p-own|viv', 'reads')
    expect(await service.editKnowledge(r, { page: 'own:release.md', old_string: 'Stage', new_string: 'Prod' })).toContain('a Viewer reads its knowledge and changes nothing')
    standings.set('project:p-own|viv', 'none')
    expect(await service.readKnowledge(r, { page: 'own:release.md' })).toContain('There is no level by that name here. The levels you can reach are org:, platform:')
    const found = await service.searchKnowledge(r, { pattern: 'stag' })
    expect(found).not.toContain('own:release.md')
  })

  it('drops an added place the person has left from a turn\'s next call, as out of the conversation\'s places', async () => {
    const { service, standings } = setup()
    standings.set('project:p-added|viv', 'none')
    expect(await service.readKnowledge(conversation(), { page: 'added:release.md' })).toContain('"added" is not among this conversation\'s places')
  })

  it('asks the standing of the person the call acts for, in that place', async () => {
    const asked: string[] = []
    const f = fakeDeps({ standing: async (owner, userId) => { asked.push(`${owner.ownerId}|${userId}`); return 'works' } })
    await createKnowledgeService(f.deps).readKnowledge(conversation(), { page: 'own:release.md' })
    expect(asked).toEqual(['p-own|viv', 'p-added|viv'])
  })
})
