import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_ORG_OWNER_ID, type KnowledgeOwnerRef } from '@agenthix/core'
import { grepRefusalMessage } from '@agenthix/core/file-tools'
import { createKnowledgeService } from '../service'
import type { KnowledgeReach } from '../reach'
import { fakeDeps } from './fakeKnowledgeDeps'

const WEB: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-web' }
const SHOP: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-shop' }
const ORG: KnowledgeOwnerRef = { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID }

let n = 0
const reach = (over: Partial<KnowledgeReach> = {}): KnowledgeReach => ({
  places: [{ level: 'website-rebuild', owner: WEB }],
  userId: 'u1',
  mayChange: true,
  callerKey: `conv-${++n}`,
  ...over,
})

function setup() {
  const f = fakeDeps()
  f.sites.put(WEB, 'processes/release.md', '---\ntitle: Release\n---\nStaging deploys go out after the checks pass.')
  f.sites.put(SHOP, 'secret.md', 'Staging for the shop.')
  f.sites.put(ORG, 'how-we-work/deploys.md', 'Staging needs an approval.')
  return { ...f, service: createKnowledgeService(f.deps) }
}

describe('search_knowledge across levels', () => {
  it('answers place, then organisation, then guide, each hit marked with its page name (D2, D3) @SC-1397', async () => {
    const { service } = setup()
    const text = await service.searchKnowledge(reach(), { pattern: 'staging' })
    const lines = text.split('\n')
    const place = lines.indexOf('website-rebuild:processes/release.md:4: Staging deploys go out after the checks pass.')
    const org = lines.indexOf('org:how-we-work/deploys.md:1: Staging needs an approval.')
    const guide = lines.indexOf('platform:your-tools/providers.md:5: Staging is not a guide word.')
    expect(place).toBeGreaterThanOrEqual(0)
    expect(org).toBeGreaterThan(place)
    expect(guide).toBeGreaterThan(org)
    expect(lines[guide - 1]).toMatch(/^\[platform: .*What you may do here is what your tools allow\.\]$/)
    expect(text).not.toContain('shop')
  })

  it('is case-insensitive and numbered unless told otherwise, and gives Grep\'s other modes @SC-1397', async () => {
    const { service } = setup()
    expect(await service.searchKnowledge(reach(), { pattern: 'STAGING', scope: 'org', '-n': false })).toBe('org:how-we-work/deploys.md: Staging needs an approval.\n[Searched the organisation (org:).]')
    expect(await service.searchKnowledge(reach(), { pattern: 'STAGING', scope: 'org', '-i': false })).toBe('No matches found: nothing in the organisation (org:).')
    expect(await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'website-rebuild', output_mode: 'files_with_matches' }))
      .toBe('Found 1 page\nwebsite-rebuild:processes/release.md\n[Searched website-rebuild:.]')
    expect(await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'org', output_mode: 'count' }))
      .toBe('org:how-we-work/deploys.md:1\nFound 1 total occurrence across 1 page.\n[Searched the organisation (org:).]')
  })

  it('narrows to one level with scope, or with a path that carries its level, and asks no other @SC-1397', async () => {
    const { service, sites } = setup()
    const text = await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'org' })
    expect(text).toBe('org:how-we-work/deploys.md:1: Staging needs an approval.\n[Searched the organisation (org:).]')
    expect(sites.calls.map(c => c.owner)).toEqual(['org:org'])
    sites.calls.length = 0
    const byPath = await service.searchKnowledge(reach(), { pattern: 'staging', path: 'website-rebuild:processes' })
    expect(byPath).toBe('website-rebuild:processes/release.md:4: Staging deploys go out after the checks pass.\n[Searched website-rebuild:.]')
    expect(sites.calls).toEqual([{ method: 'grep', owner: 'project:p-web', params: expect.objectContaining({ path: 'processes' }) }])
  })

  it('refuses a scope the caller does not hold, without naming any place it does not hold, and asks no site @SC-1401', async () => {
    const { service, sites } = setup()
    const text = await service.searchKnowledge(reach(), { pattern: 'staging', scope: 'shop' })
    expect(text).toContain('There is no level by that name here')
    expect(text).toContain('website-rebuild:, org:, platform:')
    expect(text).toContain('Nothing was changed.')
    expect(sites.calls).toEqual([])
  })

  it('names the places it searched in words, every time (F10) @SC-1397', async () => {
    const { service } = setup()
    const text = await service.searchKnowledge(reach({ places: [{ level: 'personal', owner: { ownerType: 'user', ownerId: 'u1' } }] }), { pattern: 'staging' })
    expect(text.split('\n').at(-1)).toBe('[Searched Your space (personal:), the organisation (org:) and the platform guide (platform:).]')
  })

  it('says "nothing in" the places it searched when nothing matched, and in a conversation that other places were not searched (F10) @SC-1398 @SC-1401', async () => {
    const { service } = setup()
    expect(await service.searchKnowledge(reach(), { pattern: 'no-such-words' })).toBe(
      'No matches found: nothing in website-rebuild:, the organisation (org:) or the platform guide (platform:).',
    )
    const inConversation = reach({ agent: { agentId: 'a1', conversationId: 'c1' } })
    const text = await service.searchKnowledge(inConversation, { pattern: 'no-such-words', output_mode: 'files_with_matches' })
    expect(text).toMatch(/^No pages found: nothing in website-rebuild:, the organisation \(org:\) or the platform guide \(platform:\)\.\n/)
    expect(text).toContain('A place not in this conversation was not searched: that is not the same as it being empty. suggest_place offers it to the person.')
  })

  it("in a conversation, says a scope outside its places isn't in it and that suggest_place offers it, without saying whether it exists (F10) @SC-1401", async () => {
    const { service, sites } = setup()
    const inConversation = reach({ agent: { agentId: 'a1', conversationId: 'c1' } })
    for (const scope of ['shop', 'no-such-place']) {
      const text = await service.searchKnowledge(inConversation, { pattern: 'staging', scope })
      expect(text).toBe(
        `"${scope}" is not among this conversation's places, so it was not searched: what is in it is not known, not empty. ` +
        'The places you can search are website-rebuild:, the organisation (org:) and the platform guide (platform:). ' +
        "If it is a project or the person's space, suggest_place offers it to the person; nothing in it can be read until they add it.",
      )
    }
    expect(sites.calls).toEqual([])
  })

  it('says a level\'s site cannot be reached, and the rest still answers (S8) @SC-1400', async () => {
    const { service, sites } = setup()
    sites.modes.set('project:p-web', 'unreachable')
    const text = await service.searchKnowledge(reach(), { pattern: 'staging' })
    expect(text).toContain('[website-rebuild: not searched: the Execution Site that holds it cannot be reached now. The other levels answered.]')
    expect(text).toContain('org:how-we-work/deploys.md:1: Staging needs an approval.')
    expect(text).toContain('[Searched the organisation (org:) and the platform guide (platform:).]')
  })

  it('answers within its time limit when a site never does, and a site that throws gives away nothing @SC-1400', async () => {
    const { service, sites, warnings } = setup()
    sites.modes.set('org:org', 'silent')
    sites.modes.set('project:p-web', 'throws')
    const started = Date.now()
    const text = await service.searchKnowledge(reach(), { pattern: 'staging' })
    expect(Date.now() - started).toBeLessThan(1500)
    expect(text).toContain('[org: not searched: it did not answer in time. The other levels answered.]')
    expect(text).toContain('[website-rebuild: not searched: an error stopped it')
    expect(text).toContain('platform:your-tools/providers.md')
    expect(text).not.toMatch(/10\.0\.0\.7|\/srv/)
    expect(JSON.stringify(warnings)).not.toContain('staging')
  })

  it('says the guide is missing and still answers from the other levels @SC-1400', async () => {
    const { service, setGuideMissing } = setup()
    setGuideMissing(true)
    const text = await service.searchKnowledge(reach(), { pattern: 'staging' })
    expect(text).toContain('[platform: The guide is not in this installation.]')
    expect(text).toContain('org:how-we-work/deploys.md')
  })

  it('holds an answer to 8,000 characters and says where to continue, and continuing gives the next hits @SC-1398', async () => {
    const { service, sites } = setup()
    for (let i = 0; i < 200; i++) sites.put(WEB, `big/p${String(i).padStart(3, '0')}.md`, `needle ${'x'.repeat(120)} ${i}`)
    const first = await service.searchKnowledge(reach(), { pattern: 'needle', scope: 'website-rebuild' })
    expect(first.length).toBeLessThanOrEqual(8_000)
    const next = Number(/Continue with offset (\d+)/.exec(first)?.[1])
    expect(next).toBeGreaterThan(0)
    const second = await service.searchKnowledge(reach(), { pattern: 'needle', scope: 'website-rebuild', offset: next })
    expect(second.split('\n')[0]).toContain(`big/p${String(next).padStart(3, '0')}.md`)
  })

  it('counts head_limit and offset across levels @SC-1397', async () => {
    const { service } = setup()
    const text = await service.searchKnowledge(reach(), { pattern: 'staging', head_limit: 1, offset: 1 })
    expect(text.split('\n')[0]).toBe('org:how-we-work/deploys.md:1: Staging needs an approval.')
    expect(text).toContain('Continue with offset 2')
  })

  it('gives each level\'s sections and tags for an empty pattern @SC-1399', async () => {
    const { service, sites } = setup()
    sites.put(WEB, 'processes/onboarding.md', '---\ntags: [clients, releases]\n---')
    const text = await service.searchKnowledge(reach(), { pattern: '' })
    expect(text).toContain('website-rebuild: 2 pages')
    expect(text).toContain('  sections: processes (2)')
    expect(text).toContain('clients (1)')
    expect(text).toContain('org: 1 page')
    expect(text).toContain('platform: 1 pages')
    expect(text).toContain('your-tools (1)')
  })

  it('refuses a pattern over 500 characters, a bad parameter, and the 31st search in a minute @SC-1398', async () => {
    const { service } = setup()
    expect(await service.searchKnowledge(reach(), { pattern: 'a'.repeat(501) })).toBe(grepRefusalMessage('pattern-too-long'))
    expect(await service.searchKnowledge(reach(), { pattern: 'a', '-A': 'x' })).toBe(grepRefusalMessage('invalid-parameter', '-A'))
    const r = reach()
    for (let i = 0; i < 30; i++) expect(await service.searchKnowledge(r, { pattern: 'staging', scope: 'org' })).not.toBe(grepRefusalMessage('rate-limited'))
    expect(await service.searchKnowledge(r, { pattern: 'staging', scope: 'org' })).toBe(grepRefusalMessage('rate-limited'))
  })

  it('answers a refusal of the pattern itself when no level found anything @SC-1398', async () => {
    const f = fakeDeps()
    f.sites.grep = async () => ({ ok: true, value: { outcome: 'refused', message: 'The search took longer than 2 seconds and was stopped.' } })
    f.deps.guide.grep = async () => ({ ok: false, missing: false, message: 'The search took longer than 2 seconds and was stopped.' })
    const service = createKnowledgeService(f.deps)
    expect(await service.searchKnowledge(reach(), { pattern: 'x' })).toBe('The search took longer than 2 seconds and was stopped.')
  })

  it('leaves out a place whose key would read as another level @SC-1397', async () => {
    const { service, sites } = setup()
    sites.put(SHOP, 'secret.md', 'staging')
    const text = await service.searchKnowledge(reach({ places: [{ level: 'org', owner: SHOP }] }), { pattern: 'staging' })
    expect(sites.calls.map(c => c.owner)).toEqual(['org:org'])
    expect(text).not.toContain('secret.md')
  })
})
