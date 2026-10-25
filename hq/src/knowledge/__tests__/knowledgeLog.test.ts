/**
 * S7 and S6 at hq (agent knowledge spec, part 3, *Running a pattern safely*): whatever goes wrong, hq's log is told the
 * call and its outcome, never the pattern a model wrote or a page's text, and the answer never carries an error's
 * detail. Each failure below throws an error whose message holds the person's words, as an error from a site or a
 * database could.
 */
import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_ORG_OWNER_ID, type KnowledgeOwnerRef } from '@agenthix/core'
import { createKnowledgeService } from '../service'
import type { KnowledgeReach } from '../reach'
import { fakeDeps } from './fakeKnowledgeDeps'

const WEB: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'p-web' }
const ORG: KnowledgeOwnerRef = { ownerType: 'org', ownerId: KNOWLEDGE_ORG_OWNER_ID }
const PATTERN = 'quillwort-(payroll|salaries)'
const WORDS = 'Quillwort payroll runs on the 25th'
const PAGE = `---\ntitle: Payroll\ndescription: When payroll runs.\n---\n${WORDS}.\n`

let n = 0
const reach = (): KnowledgeReach => ({
  places: [{ level: 'website-rebuild', owner: WEB }],
  userId: 'u1',
  agent: { agentId: 'kernel', conversationId: 'c1' },
  mayChange: true,
  callerKey: `log-${++n}`,
})

/** An error as a failing dependency might raise it: its message and its stack both carry what it was given. */
const leaky = (what: string) => new Error(`failed on ${what} at 10.0.0.7:/srv/knowledge/projects/p-web`)

function logged(warnings: { message: string; fields?: Record<string, unknown> }[]): string {
  return JSON.stringify(warnings)
}

describe("hq's log of a knowledge call (S7) @SC-1407", () => {
  it('holds no pattern when every level fails while searching, in each way it can', async () => {
    const f = fakeDeps()
    f.sites.put(ORG, 'payroll.md', PAGE)
    f.sites.grep = async (owner, params) => {
      if (owner.ownerType === 'org') return { ok: false, why: 'failed' }
      throw leaky(params.pattern)
    }
    f.deps.guide.grep = async params => { throw leaky(params.pattern) }
    const text = await createKnowledgeService(f.deps).searchKnowledge(reach(), { pattern: PATTERN })

    expect(f.warnings.length).toBeGreaterThan(0)
    expect(logged(f.warnings)).not.toContain('quillwort')
    expect(text).not.toMatch(/10\.0\.0\.7|\/srv|quillwort-\(/)
  })

  it('holds no pattern when the search itself throws', async () => {
    const f = fakeDeps({ isOrgAdmin: async () => { throw leaky(PATTERN) } })
    f.sites.grep = async (_o, params) => { throw leaky(params.pattern) }
    const text = await createKnowledgeService(f.deps).searchKnowledge(reach(), { pattern: PATTERN, scope: 'website-rebuild' })
    expect(logged(f.warnings)).not.toContain('quillwort')
    expect(text).not.toContain('10.0.0.7')
  })

  it("holds no page text when a write, an edit or the change's record fails", async () => {
    const f = fakeDeps({ recordChange: async entry => { throw leaky(JSON.stringify(entry)) } })
    const service = createKnowledgeService(f.deps)
    expect(await service.writeKnowledge(reach(), { page: 'website-rebuild:payroll.md', content: PAGE })).toContain('Done')

    f.sites.edit = async (_o, change) => { throw leaky(`${change.old_string} -> ${change.new_string}`) }
    const edited = await service.editKnowledge(reach(), {
      page: 'website-rebuild:payroll.md', old_string: WORDS, new_string: 'Quillwort payroll runs on the 28th',
    })
    f.sites.write = async (_o, change) => { throw leaky(change.content) }
    const written = await service.writeKnowledge(reach(), { page: 'website-rebuild:other.md', content: PAGE })

    expect(f.warnings.length).toBeGreaterThanOrEqual(3)
    expect(logged(f.warnings)).not.toMatch(/quillwort|payroll/i)
    for (const answer of [edited, written]) expect(answer).not.toMatch(/10\.0\.0\.7|\/srv/)
  })

  it('holds no page name or text when a read fails', async () => {
    const f = fakeDeps()
    f.sites.read = async (_o, page) => { throw leaky(`${page}: ${WORDS}`) }
    const text = await createKnowledgeService(f.deps).readKnowledge(reach(), { page: 'website-rebuild:quillwort-payroll.md' })
    expect(logged(f.warnings)).not.toMatch(/quillwort|payroll/i)
    expect(text).not.toMatch(/10\.0\.0\.7|\/srv/)
  })
})
