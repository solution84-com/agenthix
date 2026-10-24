import { describe, it, expect, vi } from 'vitest'

vi.mock('../../workflows/starters/propose', () => ({ proposeStarters: vi.fn() }))

import { proposeStartersFor } from '../connectStarters'
import type { StarterProposal } from '../../workflows/starters/propose'

const PLACE = { type: 'project' as const, id: 'p1' }

describe('proposing the starter workflows on connecting @SC-1318', () => {
  it('answers which versions now wait', async () => {
    const waiting: StarterProposal[] = [{ workflow: 'push', proposed: true, version: 1 }, { workflow: 'pull', proposed: true, version: 1 }]
    const propose = vi.fn(async () => waiting)
    expect(await proposeStartersFor(PLACE, 'ws1', propose)).toEqual({ proposed: waiting, problem: null })
    expect(propose).toHaveBeenCalledWith(PLACE, { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' })
  })

  it('leaves the connection standing and says so when proposing fails', async () => {
    const out = await proposeStartersFor(PLACE, null, vi.fn(async () => { throw new Error('no reviewer') }))
    expect(out.proposed).toEqual([])
    expect(out.problem).toMatch(/connected, but its starter workflows could not be proposed: no reviewer/)
  })
})
