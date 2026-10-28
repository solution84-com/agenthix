import { describe, expect, it } from 'vitest'
import { MAX_SKILL_PROPOSALS_PER_RUN, PROPOSE_SKILL_AIMS, PROPOSE_SKILL_DECLARATION, PROPOSE_SKILL_TOOL } from '../skillTools.js'

describe('propose_skill as an agent sees it', () => {
  it('acts for the calling run only: the site fills in its run, and no argument names a person', () => {
    expect(PROPOSE_SKILL_DECLARATION.name).toBe(PROPOSE_SKILL_TOOL)
    expect(PROPOSE_SKILL_DECLARATION.runIdFromCaller).toBe(true)
    expect(Object.keys(PROPOSE_SKILL_DECLARATION.args).sort()).toEqual(['aim', 'description', 'edits', 'files', 'name', 'why'])
  })

  it('names every aim and the per-run limit in words the agent reads', () => {
    for (const aim of PROPOSE_SKILL_AIMS) expect(PROPOSE_SKILL_DECLARATION.args.aim!.description).toContain(aim)
    expect(PROPOSE_SKILL_DECLARATION.description).toContain(`At most ${MAX_SKILL_PROPOSALS_PER_RUN} proposals`)
    expect(PROPOSE_SKILL_DECLARATION.args.files!.type).toBe('stringMap')
    expect(PROPOSE_SKILL_DECLARATION.args.edits!.optional).toBe(true)
  })
})
