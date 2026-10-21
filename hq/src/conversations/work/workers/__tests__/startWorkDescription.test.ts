import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../../agents/dispatchService', () => ({}))
vi.mock('../../../../sessions/siteRuntimeStore', () => ({}))

import type { SharedBoundary } from '../../../contract'
import { describeStartWork } from '../startWork'
import { notAssigned, projectWords } from '../../boundaries'

const personal: SharedBoundary = { key: 'personal', type: 'user', id: 'u1', name: 'your space' }
const shop: SharedBoundary = { key: 'SHOP', type: 'project', id: 'p1', name: 'Shop' }
const walkthrough: SharedBoundary = { key: 'WAL', type: 'project', id: 'p2', name: 'Walkthrough' }

describe("start_work's description @SC-960 @SC-968", () => {
  it('lists each place by its key and its name, and says either finds a project', () => {
    const text = describeStartWork({ admitted: [personal, shop] })
    expect(text).toContain("- personal: the person's own space")
    expect(text).toContain('- SHOP: the Shop project')
    expect(text).toMatch(/by its key or its name/)
  })

  it('makes work in two places two pieces of work, one started in each', () => {
    const text = describeStartWork({ admitted: [personal, shop] })
    expect(text).toMatch(/Work in one place sees only that place/)
    expect(text).toMatch(/two places is two pieces of work, one\s+started in each, never one covering both/)
  })

  it('makes the work its own, said in the first person, never a job that comes back', () => {
    const text = describeStartWork({ admitted: [personal] })
    expect(text).toMatch(/Do work yourself in the background/)
    expect(text).toMatch(/do not wait for it/)
    expect(text).toMatch(/say in one short line, in the first person and in the same step as the\s+call, what you are doing/)
    expect(text).not.toMatch(/do not announce it/)
    expect(text).not.toMatch(/\bjobs?\b|comes back/)
  })

  it("lists the projects the person works in that the agent isn't assigned to, and how an admin assigns it", () => {
    const text = describeStartWork({ admitted: [personal], unassigned: [walkthrough] })
    expect(text).toMatch(/Projects the person works in that you aren't assigned to/)
    expect(text).toContain('- WAL: the Walkthrough project')
    expect(text).toMatch(/Members, ＋ Add, An agent/)
    expect(text).toMatch(/Never do that project's work from another place/)
  })

  it("has an unassigned project asked for anyway, so its refusal comes back and is told at once (finding 32)", () => {
    const text = describeStartWork({ admitted: [personal], unassigned: [walkthrough] })
    expect(text).toMatch(/still call start_work there, beside any other work/)
    expect(text).toMatch(/tell the person in\s+this reply/)
    expect(text).not.toMatch(/Say so when the person asks/)
  })

  it('has work in several places started together, in one step', () => {
    expect(describeStartWork({ admitted: [personal, shop] })).toMatch(/Start them all together, in one step/)
  })

  it('says nothing of unassigned projects when there are none', () => {
    expect(describeStartWork({ admitted: [personal] })).not.toMatch(/aren't assigned/)
  })
})

describe('naming a project @SC-960 @SC-968', () => {
  it('reads "the Walkthrough project" and quoted names as the name', () => {
    expect(projectWords('the Walkthrough project')).toBe('Walkthrough')
    expect(projectWords('"Walkthrough"')).toBe('Walkthrough')
    expect(projectWords('  Walkthrough ')).toBe('Walkthrough')
  })

  it('refuses an unassigned project with how a project admin assigns the agent', () => {
    expect(notAssigned('Kernel', 'Walkthrough')).toBe(
      "Kernel isn't assigned to Walkthrough; a project admin can assign Kernel there: in Walkthrough, open Members, select ＋ Add, then An agent, and Assign beside Kernel",
    )
  })
})
