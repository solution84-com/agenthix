import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('#db', () => ({ prisma: { agentRun: { update: h.update } } }))

import { recordSkillsUsed, skillUsesOf } from '../skillUseRecord'
import type { StagingResult } from '../skillStaging'

beforeEach(() => {
  h.update.mockReset()
  h.update.mockResolvedValue({})
})

const F = 'a'.repeat(64)
const result: StagingResult = {
  staged: [
    { source: 'platform', slug: 'plan', name: 'platform-plan', fingerprint: F },
    { source: 'org', slug: 'review', name: 'org-review', fingerprint: F, identity: 'acme/review', version: '1.2.0' },
    { source: 'shared', slug: 'team', name: 'shared-team', fingerprint: F, placeId: 'p1', path: '.agents/skills/team' },
    { source: 'person', slug: 'notes', name: 'person-notes', fingerprint: F, identity: 'u1/notes', version: '1.0.0', personId: 'u1' },
  ],
  refused: [
    { source: 'shared', name: 'shared-old', fingerprint: F, origin: { placeId: 'p1', path: '.agents/skills/old' }, reason: 'it has changed since it was switched on' },
  ],
}

describe('the record of skills a run used', () => {
  it('has one entry per staged name with what it was, and one per refusal with why', () => {
    expect(skillUsesOf(result)).toEqual([
      { name: 'platform-plan', source: 'platform', fingerprint: F },
      { name: 'org-review', source: 'org', fingerprint: F, identity: 'acme/review', version: '1.2.0' },
      { name: 'shared-team', source: 'shared', fingerprint: F, placeId: 'p1', path: '.agents/skills/team' },
      { name: 'person-notes', source: 'person', fingerprint: F, identity: 'u1/notes', version: '1.0.0', personId: 'u1' },
      { name: 'shared-old', source: 'shared', fingerprint: F, placeId: 'p1', path: '.agents/skills/old', refused: 'it has changed since it was switched on' },
    ])
  })

  it('is written on the run, refusals included', async () => {
    await recordSkillsUsed('run-1', { staged: [], refused: result.refused })
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'run-1' }, data: { skillsUsed: skillUsesOf({ staged: [], refused: result.refused }) } })
  })

  it('never fails the run when it cannot be written', async () => {
    h.update.mockRejectedValue(new Error('db down'))
    await expect(recordSkillsUsed('run-1', result)).resolves.toBeUndefined()
  })

  it('writes nothing when nothing was staged or refused', async () => {
    await recordSkillsUsed('run-1', { staged: [], refused: [] })
    expect(h.update).not.toHaveBeenCalled()
  })
})
