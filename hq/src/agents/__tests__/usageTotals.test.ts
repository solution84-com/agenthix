import { describe, it, expect } from 'vitest'
import type { RunUsageRow } from '@agenthix/core'
import { usageTotals, runPerson, runProject, addTotals, emptyTotals, type UsageSession } from '../usageTotals'

const row = (over: Partial<RunUsageRow> & { sessionId: string }): RunUsageRow => ({
  agentId: 'a1', model: 'claude-sonnet-4-6', onBehalfOfUserId: null, ownerType: null, ownerId: null,
  runCount: 1, inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1_000_000,
  lastRunAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

const sessions = new Map<string, UsageSession>([
  // Ana's chat in her own space.
  ['chat-own', { userId: 'ana', sessionType: 'chat', primaryOwnerType: 'user', primaryOwnerId: 'ana', task: null }],
  // Ana's chat placed in project p1.
  ['chat-p1', { userId: 'ana', sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: 'p1', task: null }],
  // A task in p1 done on Bo's behalf; its session names an admin as bookkeeping.
  ['task-p1', { userId: 'admin', sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: 'p1', task: { projectId: 'p1', onBehalfOfUserId: 'bo' } }],
  // A task in Bo's personal project, which works in his own storage.
  ['task-own', { userId: 'bo', sessionType: 'task', primaryOwnerType: 'user', primaryOwnerId: 'bo', task: { projectId: 'bo-personal', onBehalfOfUserId: 'bo' } }],
])

describe('whose and where a run is @SC-579', () => {
  it("is a chat's person, and the person a dispatch named over a task's person", () => {
    expect(runPerson(row({ sessionId: 'chat-own' }), sessions.get('chat-own'))).toBe('ana')
    expect(runPerson(row({ sessionId: 'task-p1' }), sessions.get('task-p1'))).toBe('bo')
    expect(runPerson(row({ sessionId: 'task-p1', onBehalfOfUserId: 'cy' }), sessions.get('task-p1'))).toBe('cy')
    expect(runPerson(row({ sessionId: 'gone' }), undefined)).toBeNull()
  })

  it("is a task's project, a placed chat's project, and no project for a person's own space", () => {
    expect(runProject(sessions.get('task-p1'))).toBe('p1')
    expect(runProject(sessions.get('chat-p1'))).toBe('p1')
    expect(runProject(sessions.get('chat-own'))).toBeNull()
    expect(runProject(sessions.get('task-own'))).toBe('bo-personal')
  })
})

describe('usage totals @SC-579', () => {
  const rows = [
    row({ sessionId: 'chat-own' }),
    row({ sessionId: 'chat-p1', runCount: 2 }),
    row({ sessionId: 'task-p1', model: 'no-such-model', outputTokens: 10, totalTokens: 1_000_010 }),
    row({ sessionId: 'task-own' }),
  ]

  it('counts one run for its person, its project and the organisation', () => {
    const t = usageTotals(rows, sessions, { personId: 'ana', projectId: 'p1', personalProjectIds: new Set(['bo-personal']) })

    expect(t.organisation.runCount).toBe(5)
    expect(t.person?.runCount).toBe(3)
    expect(t.project?.runCount).toBe(3)
    expect(t.person?.totalTokens).toBe(2_000_000)
  })

  it('prices tokens by model, and says how many it could not price', () => {
    const t = usageTotals(rows, sessions, { personId: 'bo', personalProjectIds: new Set() })

    // Sonnet 4.6 input is $3 per million tokens.
    expect(t.person?.costUsd).toBeCloseTo(3)
    expect(t.person?.unpricedTokens).toBe(1_000_010)
    expect(t.person?.energyKwh).toBeCloseTo(2_000_010 * 0.000002)
  })

  it("puts personal spaces together by project, never by someone's personal project", () => {
    const t = usageTotals(rows, sessions, { personalProjectIds: new Set(['bo-personal']) })

    expect([...t.byProject.keys()].sort()).toEqual(['p1'])
    expect(t.byProject.get('p1')?.runCount).toBe(3)
    expect(t.ownSpaces.runCount).toBe(2)
    expect(t.person).toBeNull()
    expect(t.project).toBeNull()
  })
})

describe('addTotals @SC-579', () => {
  it('adds every count of one set of totals into another', () => {
    const into = { ...emptyTotals(), runCount: 1, totalTokens: 10, costUsd: 0.5 }
    addTotals(into, { ...emptyTotals(), runCount: 2, totalTokens: 5, costUsd: 0.25, unpricedTokens: 3, energyKwh: 1 })
    expect(into).toEqual({ ...emptyTotals(), runCount: 3, totalTokens: 15, costUsd: 0.75, unpricedTokens: 3, energyKwh: 1 })
  })
})
