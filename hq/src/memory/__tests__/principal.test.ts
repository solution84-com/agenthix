/**
 * Who a memory tool call is for (memory and knowledge spec, The agent's tools): a person's own scopes are reached
 * only where nobody else reads the work — never from a task's thread, which its project's members all read, unless
 * the task is in that person's own space.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TurnCapability } from '../../conversations/contract'

const db = vi.hoisted(() => ({ personalOwner: null as string | null }))

vi.mock('wasp/server', () => ({
  prisma: { user: { findUnique: async () => ({ deactivatedAt: null }) } },
}))
vi.mock('../../projects/personalProject', () => ({ personalOwnerOf: async () => db.personalOwner }))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: async () => null }))

import { memoryPrincipalOf } from '../principal'

const turn = (over: Partial<TurnCapability>) =>
  ({ kind: 'turn', turn: { agentId: 'a1', actingUserId: 'carol', readerUserId: 'carol', home: 'PROJECT', projectId: 'p1', taskId: null, ...over } as TurnCapability }) as const

beforeEach(() => { db.personalOwner = null })

describe('memoryPrincipalOf for a turn @SC-2102', () => {
  it('is for the person in their own conversation', async () => {
    expect(await memoryPrincipalOf(turn({ home: 'PROJECT' }), 'recall')).toEqual({ personId: 'carol', agentId: 'a1', place: { type: 'project', id: 'p1' } })
    expect((await memoryPrincipalOf(turn({ home: 'PERSON', projectId: null }), 'recall')).personId).toBe('carol')
  })

  it('is for no person in a task\'s thread, so it reaches no memory', async () => {
    expect(await memoryPrincipalOf(turn({ home: 'TASK', taskId: 't1' }), 'recall')).toEqual({ personId: null, agentId: 'a1', place: { type: 'project', id: 'p1' } })
  })

  it('is for the person in a task\'s thread in their own space', async () => {
    db.personalOwner = 'carol'
    expect((await memoryPrincipalOf(turn({ home: 'TASK', taskId: 't1' }), 'recall')).personId).toBe('carol')
  })
})
