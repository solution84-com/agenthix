import { describe, it, expect } from 'vitest'
import { noteSkillUses } from '../lastUsed'

const F = 'a'.repeat(64)
const review = { name: 'org-code-review', source: 'org', fingerprint: F, identity: 'fernhill/code-review', version: '1.3.0' }
const placeSkill = { name: 'boundary-release', source: 'boundary', fingerprint: F, placeId: 'p1', path: '.agents/skills/release' }

function recorder(fail = false) {
  const calls: Array<{ model: string; where: Record<string, unknown>; data: Record<string, unknown> }> = []
  const delegate = (model: string) => ({
    updateMany: async (q: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (fail) throw new Error('read-only')
      calls.push({ model, ...q })
      return { count: 1 }
    },
  })
  return { db: { asset: delegate('asset'), placeSkill: delegate('placeSkill') } as never, calls }
}

describe('last used, stamped from runs’ records (UQ4)', () => {
  it('stamps each skill once, with its newest use, the agent and where the run worked', async () => {
    const { db, calls } = recorder()
    await noteSkillUses(db, [
      { agentId: 'ada', createdAt: '2026-10-27T09:00:00Z', endedAt: '2026-10-27T11:05:00Z', skillsUsed: [review, placeSkill] },
      { agentId: 'priya', createdAt: '2026-10-26T09:00:00Z', skillsUsed: [review] },
    ], { placeType: 'project', placeId: 'p9' })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      model: 'asset',
      where: { kind: 'SKILL', publisher: 'fernhill', name: 'code-review', versions: { some: { digest: F } } },
      data: { lastUsedAt: new Date('2026-10-27T11:05:00Z'), lastUsedAgentId: 'ada', lastUsedPlaceType: 'project', lastUsedPlaceId: 'p9' },
    })
    expect(calls[0].where.OR).toEqual([{ lastUsedAt: null }, { lastUsedAt: { lt: new Date('2026-10-27T11:05:00Z') } }])
    expect(calls[1]).toMatchObject({ model: 'placeSkill', where: { placeId: 'p1', path: '.agents/skills/release' }, data: { lastUsedAgentId: 'ada' } })
  })

  it('never counts a refused entry, and a failed write never fails the read', async () => {
    const { db, calls } = recorder()
    await noteSkillUses(db, [{ agentId: 'ada', createdAt: '2026-10-27T09:00:00Z', skillsUsed: [{ ...review, refused: 'not staged' }] }], null)
    expect(calls).toEqual([])
    await expect(noteSkillUses(recorder(true).db, [{ agentId: 'ada', createdAt: '2026-10-27T09:00:00Z', skillsUsed: [review] }], null)).resolves.toBeUndefined()
  })
})
