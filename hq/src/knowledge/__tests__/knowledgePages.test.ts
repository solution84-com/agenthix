import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_ORG_OWNER_ID, type KnowledgeOwnerRef } from '@agenthix/core'
import { versionOf } from '@agenthix/core/file-tools'
import { createKnowledgeService } from '../service'
import type { KnowledgeReach } from '../reach'
import { fakeDeps } from './fakeKnowledgeDeps'

const WEB: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-web' }
const ME: KnowledgeOwnerRef = { ownerType: 'user', ownerId: 'u1' }
const ORG: KnowledgeOwnerRef = { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID }
const PAGE = '---\ntitle: Release\n---\nStaging deploys go out after the checks pass.\n'
const v = (t: string) => versionOf(Buffer.from(t, 'utf8'))

let n = 0
const reach = (over: Partial<KnowledgeReach> = {}): KnowledgeReach => ({
  places: [{ level: 'website-rebuild', owner: WEB }, { level: 'personal', owner: ME }],
  userId: 'u1',
  agent: { agentId: 'kernel', conversationId: 'c1' },
  mayChange: true,
  callerKey: `conv-${++n}`,
  ...over,
})

function setup() {
  const f = fakeDeps()
  f.sites.put(WEB, 'processes/release.md', PAGE)
  f.sites.put(ORG, 'how-we-work/review.md', '---\ntitle: Review\n---\nTwo approvals.\n')
  return { ...f, service: createKnowledgeService(f.deps) }
}

describe('read_knowledge', () => {
  it('reads a page of a held level with Read\'s line numbers and its version @SC-1402', async () => {
    const { service } = setup()
    const text = await service.readKnowledge(reach(), { page: 'website-rebuild:processes/release.md', offset: 4, limit: 1 })
    expect(text).toBe(`     4\tStaging deploys go out after the checks pass.\n[website-rebuild:processes/release.md: lines 4-4 of 4. Version ${v(PAGE)}.]`)
  })

  it('reads org: and platform: pages, platform: through the guide @SC-1402', async () => {
    const { service } = setup()
    expect(await service.readKnowledge(reach(), { page: 'org:how-we-work/review.md' })).toContain('Two approvals.')
    expect(await service.readKnowledge(reach(), { page: 'platform:your-tools/providers.md' })).toBe('GUIDE your-tools/providers.md')
  })

  it('refuses a run a level it does not hold with a fixed message naming only what it holds, and asks no site @SC-1401', async () => {
    const { service, sites } = setup()
    const run = { agentId: 'kernel', runId: 'r1' }
    const text = await service.readKnowledge(reach({ agent: run }), { page: 'shop:secret.md' })
    expect(text).toBe(
      'There is no level by that name here. The levels you can reach are website-rebuild:, personal:, org:, platform:; a page\'s name starts with one of them, as search_knowledge shows it. Nothing was changed.',
    )
    expect(await service.readKnowledge(reach({ places: [{ level: 'website-rebuild', owner: WEB }], agent: run }), { page: 'personal:notes.md' })).toContain('There is no level by that name here')
    expect(sites.calls).toEqual([])
  })

  it("in a conversation, says a level outside its places is out of reach, not empty, offered with suggest_place, alike for a real place and a made-up one (P6, F10) @SC-1401", async () => {
    const { service, sites } = setup()
    const inConversation = reach({ places: [{ level: 'website-rebuild', owner: WEB }] })
    for (const level of ['shop', 'no-such-place']) {
      expect(await service.readKnowledge(inConversation, { page: `${level}:secret.md` })).toBe(
        `"${level}" is not among this conversation's places, so nothing in it was read: what is in it is not known, not empty. ` +
        'The places you can reach are website-rebuild:, the organisation (org:) and the platform guide (platform:). ' +
        "If it is a project or the person's space, suggest_place offers it to the person; nothing in it can be read or changed until they add it. Nothing was changed.",
      )
    }
    expect(await service.editKnowledge(inConversation, { page: 'shop:secret.md', old_string: 'a', new_string: 'b' })).toMatch(/^"shop" is not among this conversation's places/)
    expect(sites.calls).toEqual([])
  })

  it('refuses a name with no level, and a name leaving its level @SC-1402', async () => {
    const { service, sites } = setup()
    expect(await service.readKnowledge(reach(), { page: 'processes/release.md' })).toContain('Name the page with its level first')
    for (const page of ['website-rebuild:../../users/7/x.md', 'website-rebuild:/etc/passwd', 'org:a\\b.md', 'org:a//b.md']) {
      expect(await service.readKnowledge(reach(), { page })).toContain('That is not a page\'s name')
    }
    expect(sites.calls).toEqual([])
  })

  it('says a page is missing, or its site unreachable, in fixed words @SC-1402', async () => {
    const { service, sites } = setup()
    expect(await service.readKnowledge(reach(), { page: 'website-rebuild:nope.md' })).toContain('There is no such page in website-rebuild:.')
    sites.modes.set('project:p-web', 'unreachable')
    expect(await service.readKnowledge(reach(), { page: 'website-rebuild:processes/release.md' }))
      .toBe('website-rebuild: knowledge is unavailable: the Execution Site that holds it cannot be reached now. Try again later. Nothing was changed.')
    sites.modes.set('project:p-web', 'throws')
    const failed = await service.readKnowledge(reach(), { page: 'website-rebuild:processes/release.md' })
    expect(failed).toContain('could not be reached because of an error')
    expect(failed).not.toMatch(/10\.0\.0\.7|\/srv/)
  })
})

describe('write_knowledge @SC-1403', () => {
  it('makes a new page with no base version', async () => {
    const { service, sites } = setup()
    const text = await service.writeKnowledge(reach(), { page: 'website-rebuild:processes/new.md', content: '---\ntitle: New\n---\n' })
    expect(text).toMatch(/^Done: website-rebuild:processes\/new\.md created\. Version [0-9a-f]{12}\.$/)
    expect(sites.calls.at(-1)?.params).toMatchObject({ baseVersion: null })
  })

  it('refuses to replace an existing page that was not read first, and gives none of its text', async () => {
    const { service, sites } = setup()
    const text = await service.writeKnowledge(reach(), { page: 'website-rebuild:processes/release.md', content: '---\ntitle: X\n---\n' })
    expect(text).toBe('There is already a page website-rebuild:processes/release.md. Read it with read_knowledge first, then write it, or change one passage with edit_knowledge. Nothing was changed.')
    expect(sites.text(WEB, 'processes/release.md')).toBe(PAGE)
  })

  it('writes over a page that was read, passing the version read as the base', async () => {
    const { service, sites } = setup()
    const r = reach()
    await service.readKnowledge(r, { page: 'website-rebuild:processes/release.md' })
    const text = await service.writeKnowledge(r, { page: 'website-rebuild:processes/release.md', content: '---\ntitle: R2\n---\n' })
    expect(text).toContain('Done: website-rebuild:processes/release.md edited.')
    expect(text).toContain('The previous one is in History.')
    expect(sites.calls.at(-1)?.params).toMatchObject({ baseVersion: v(PAGE) })
    // A second write starts from the first one's version, as Write after Write does.
    expect(await service.writeKnowledge(r, { page: 'website-rebuild:processes/release.md', content: '---\ntitle: R3\n---\n' })).toContain('Done:')
  })

  it('answers a stale read with the gate\'s conflict and the current text, from which the next write goes', async () => {
    const { service, sites } = setup()
    const r = reach()
    await service.readKnowledge(r, { page: 'website-rebuild:processes/release.md' })
    sites.put(WEB, 'processes/release.md', '---\ntitle: Theirs\n---\nMia approves.\n')
    const text = await service.writeKnowledge(r, { page: 'website-rebuild:processes/release.md', content: '---\ntitle: Mine\n---\n' })
    expect(text).toContain('changed since it was read')
    expect(text).toContain('     4\tMia approves.')
    expect(sites.text(WEB, 'processes/release.md')).toContain('Theirs')
    expect(await service.writeKnowledge(r, { page: 'website-rebuild:processes/release.md', content: '---\ntitle: Mine\n---\n' })).toContain('Done:')
  })

  it('does not share what one caller read with another', async () => {
    const { service } = setup()
    await service.readKnowledge(reach({ callerKey: 'a' }), { page: 'website-rebuild:processes/release.md' })
    expect(await service.writeKnowledge(reach({ callerKey: 'b' }), { page: 'website-rebuild:processes/release.md', content: '---\ntitle: X\n---\n' }))
      .toContain('Read it with read_knowledge first')
  })

  it('passes the gate\'s problems on, and refuses an over-size page before sending it', async () => {
    const { service, sites } = setup()
    expect(await service.writeKnowledge(reach(), { page: 'website-rebuild:x.md', content: 'no front matter' })).toBe('x.md was not saved: title is missing. Nothing was changed.')
    const calls = sites.calls.length
    expect(await service.writeKnowledge(reach(), { page: 'website-rebuild:x.md', content: `---\n${'a'.repeat(70_000)}` })).toContain('over 64 KB')
    expect(sites.calls.length).toBe(calls)
  })
})

describe('who may change what @SC-1405', () => {
  it('refuses every change to platform: pages', async () => {
    const { service, admins } = setup()
    admins.add('u1')
    for (const call of [
      service.writeKnowledge(reach(), { page: 'platform:your-tools/providers.md', content: '---\ntitle: x\n---' }),
      service.editKnowledge(reach(), { page: 'platform:your-tools/providers.md', old_string: 'a', new_string: 'b' }),
      service.deleteKnowledge(reach(), { page: 'platform:your-tools/providers.md' }),
    ]) expect(await call).toContain('platform: pages describe')
  })

  it('changes org: pages only for an organisation admin', async () => {
    const { service, sites, admins } = setup()
    const edit = { page: 'org:how-we-work/review.md', old_string: 'Two approvals.', new_string: 'One approval.' }
    const refused = await service.editKnowledge(reach(), edit)
    expect(refused).toBe('Only an organisation admin, or an agent acting for one, can change org: pages. Ask an organisation admin of HQ to make this change. Nothing was changed.')
    expect(sites.text(ORG, 'how-we-work/review.md')).toContain('Two approvals.')
    admins.add('u1')
    expect(await service.editKnowledge(reach(), edit)).toContain('Done: org:how-we-work/review.md edited.')
  })

  it('refuses every change when the caller may not change, before asking a site', async () => {
    const { service, sites } = setup()
    const r = reach({ mayChange: false })
    expect(await service.writeKnowledge(r, { page: 'website-rebuild:n.md', content: '---\ntitle: n\n---' })).toContain('Knowledge cannot be changed from here')
    expect(await service.editKnowledge(r, { page: 'website-rebuild:processes/release.md', old_string: 'a', new_string: 'b' })).toContain('Knowledge cannot be changed from here')
    expect(await service.deleteKnowledge(r, { page: 'personal:x.md' })).toContain('Knowledge cannot be changed from here')
    expect(sites.calls).toEqual([])
  })
})

describe('edit_knowledge and delete_knowledge @SC-1404', () => {
  it('edits without a read, and passes the gate\'s count on', async () => {
    const { service, sites } = setup()
    sites.put(WEB, 'twice.md', 'a a')
    expect(await service.editKnowledge(reach(), { page: 'website-rebuild:twice.md', old_string: 'a', new_string: 'b' })).toContain('found 2 times')
    expect(await service.editKnowledge(reach(), { page: 'website-rebuild:twice.md', old_string: 'a', new_string: 'b', replace_all: true })).toContain('Done:')
    expect(sites.text(WEB, 'twice.md')).toBe('b b')
  })

  it('deletes a page and says how to restore it', async () => {
    const { service, sites } = setup()
    const text = await service.deleteKnowledge(reach(), { page: 'website-rebuild:processes/release.md' })
    expect(text).toContain('Deleted website-rebuild:processes/release.md. It is kept among the recently deleted for 30 days')
    expect(sites.text(WEB, 'processes/release.md')).toBeUndefined()
  })
})

describe('the change record (G5) @SC-1406', () => {
  it('records each accepted change with the agent, its person and conversation, and nothing for a refusal', async () => {
    const { service, records } = setup()
    const r = reach({ agent: { agentId: 'kernel', runId: 'run-9' } })
    await service.writeKnowledge(r, { page: 'website-rebuild:processes/release.md', content: '---\ntitle: X\n---\n' })
    expect(records).toEqual([])
    await service.writeKnowledge(r, { page: 'personal:notes.md', content: '---\ntitle: Notes\n---\n' })
    expect(records).toEqual([{
      owner: ME, page: 'notes.md', kind: 'created', version: v('---\ntitle: Notes\n---\n'),
      reach: expect.objectContaining({ userId: 'u1', agent: { agentId: 'kernel', runId: 'run-9' } }),
    }])
  })

  it('records a person\'s change with no agent, and a delete with the version the page had', async () => {
    const { service, records } = setup()
    await service.deleteKnowledge(reach({ agent: undefined }), { page: 'website-rebuild:processes/release.md' })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ owner: WEB, page: 'processes/release.md', kind: 'deleted', version: v(PAGE) })
    expect(records[0].reach.agent).toBeUndefined()
  })

  it('keeps the change and says it was done when the record cannot be written', async () => {
    const f = fakeDeps({ recordChange: async () => { throw new Error('db down') } })
    const service = createKnowledgeService(f.deps)
    expect(await service.writeKnowledge(reach(), { page: 'personal:n.md', content: '---\ntitle: n\n---' })).toContain('Done:')
    expect(f.warnings.some(w => w.message.includes('not recorded'))).toBe(true)
  })
})

describe('never throwing for what a caller did (S8) @SC-1407', () => {
  it('answers a bad input with a fixed message', async () => {
    const { service } = setup()
    expect(await service.readKnowledge(reach(), { page: 42 })).toContain('The parameter page is not valid')
    expect(await service.writeKnowledge(reach(), null)).toContain('is not valid')
    expect(await service.editKnowledge(reach(), { page: 'org:x.md', old_string: '', new_string: 'b' })).toContain('The parameter old_string is not valid')
  })

  it('answers a fixed message when a dependency throws', async () => {
    const f = fakeDeps({ isOrgAdmin: async () => { throw new Error('db at 10.0.0.7') } })
    const service = createKnowledgeService(f.deps)
    const text = await service.deleteKnowledge(reach(), { page: 'org:x.md' })
    expect(text).toContain('could not finish')
    expect(text).not.toContain('10.0.0.7')
  })
})
