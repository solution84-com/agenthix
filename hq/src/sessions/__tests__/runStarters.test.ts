import { describe, it, expect, vi } from 'vitest'

vi.mock('../../projects/onBehalfOfOperations', () => ({
  usernames: vi.fn(async (ids: string[]) => new Map(ids.map(id => [id, `name-${id}`]))),
}))
import { starterText, withRunStarters } from '../runStarters'

const run = (id: string, startedBy?: string, person?: string) =>
  ({ id, metadata: { dispatch: { ...(startedBy ? { startedBy } : {}), ...(person ? { onBehalfOfUserId: person } : {}) } } })

describe("what started a task session's runs, and who they are for @SC-516", () => {
  it('names the person who started a run, "you" for the viewer', async () => {
    const out = await withRunStarters([run('r1', 'person', 'u-ana'), run('r2', 'person', 'u-me')], 'u-me')
    expect(out.map(r => r.startedBy)).toEqual(['started by name-u-ana', 'started by you'])
  })

  it('says what started an automated run, and adds who it is for', async () => {
    const out = await withRunStarters([run('r1', 'pulse', 'u-ana'), run('r2', 'schedule', 'u-me'), run('r3', 'agent', 'u-ana')], 'u-me')
    expect(out.map(r => r.startedBy)).toEqual([
      'started by automation · for name-u-ana',
      'started on schedule · for you',
      'started by an agent · for name-u-ana',
    ])
  })

  it('never reads a run with no recorded starter as one a person started', () => {
    expect(starterText(null, 'Ana')).toBe('for Ana')
    expect(starterText(null, null)).toBeNull()
    expect(starterText('pulse', null)).toBe('started by automation')
  })

  it("does not hand the run's metadata to the client", async () => {
    const [first] = await withRunStarters([run('r1', 'person', 'u-ana')], 'u-me')
    expect('metadata' in first).toBe(false)
  })
})
