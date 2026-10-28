import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))
const origin = vi.hoisted(() => vi.fn())
vi.mock('../usedSkillOrigin', async (importOriginal) => ({
  ...await importOriginal<typeof import('../usedSkillOrigin')>(),
  usedSkillOrigin: origin,
}))

import { skillStepsOf } from '../sessionSkillSteps'

const F = 'a'.repeat(64)
const review = { name: 'org-code-review', source: 'org', fingerprint: F, identity: 'fernhill/code-review', version: '1.3.0' }
const notes = { name: 'person-notes', source: 'person', fingerprint: F, identity: 'u2/notes', version: '1.0.0', personId: 'u2' }
const deps = { db: {} as never, sees: async () => true }

beforeEach(() => {
  origin.mockReset().mockImplementation(async (_d: unknown, _viewer: string, use: { name: string }) =>
    use.name === 'org-code-review' ? { title: 'Code review', where: 'Fernhill', version: '1.3.0' } : null)
})

describe("a session's used skills, named for the viewer @M6", () => {
  it('names each run\'s skills the viewer may see, and leaves out the rest', async () => {
    const runs = await skillStepsOf(deps, 'u1', [
      { id: 'r2', skillsUsed: [review, notes] },
      { id: 'r1', skillsUsed: [review] },
      { id: 'r0', skillsUsed: null },
    ])
    expect(runs).toEqual({
      r2: { 'org-code-review': 'Used the skill Code review · Fernhill · 1.3.0' },
      r1: { 'org-code-review': 'Used the skill Code review · Fernhill · 1.3.0' },
      r0: {},
    })
    // One check per distinct entry, made now for this viewer.
    expect(origin).toHaveBeenCalledTimes(2)
    expect(origin.mock.calls.every(c => c[1] === 'u1')).toBe(true)
  })

  it('never counts a refused entry', async () => {
    const runs = await skillStepsOf(deps, 'u1', [{ id: 'r1', skillsUsed: [{ ...review, refused: 'not staged' }] }])
    expect(runs).toEqual({ r1: {} })
    expect(origin).not.toHaveBeenCalled()
  })
})
