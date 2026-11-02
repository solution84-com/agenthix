/**
 * Answering an agent's merge card: only a Member or Admin answers, *Merge* only by their own press, a second press
 * does nothing, and a card made against a `main` that has moved since merges nothing and offers the dialog. The
 * person's standing, the branch's row and the merge itself are stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OperationEnd } from '../../conversations/contract'
import type { MergeAsk } from '../merge'
import type { MergeBranchResult } from '../views'

const world = vi.hoisted(() => ({
  members: new Set<string>(),
  branchOpen: true,
  appended: [] as { kind: string; body: { text: string; target?: { kind: string; id: string; params?: Record<string, string> } } }[],
}))
vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } },
  prisma: { operation: { findUnique: async () => ({ boundaryType: 'project', boundaryId: 'p1' }) } },
}))
vi.mock('../workspaceAccess', () => ({
  mayActIn: async (_ref: unknown, userId: string) => world.members.has(userId),
  reachWorkspace: async () => ({ logicalSiteId: 'site-1' }),
}))
vi.mock('../branchRows', () => ({
  openBranchById: async () => (world.branchOpen ? { id: 'b1', workspaceId: 'w1', name: 'add-login-page' } : null),
}))
vi.mock('../merge', () => ({ mergeBranch: vi.fn() }))
vi.mock('../../conversations/store/messages', () => ({
  appendMessage: async (m: { kind: string; body: never }) => { world.appended.push(m); return { message: m } },
}))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: { message: () => {} } }))

import { answerMergeCard, mergeAnswerRefusal, MERGE_BY_PRESS } from '../mergeCardAnswer'
import type { MergeCardArgs } from '../mergeCardArgs'

const MAIN = 'a'.repeat(40)
const args: MergeCardArgs = {
  branchId: 'b1', workspaceId: 'w1', branch: 'add-login-page', main: 'main', expectedMain: MAIN,
  message: 'Kernel for Mia · Login page', agentId: 'agent-1', agentName: 'Kernel',
}
const row = { id: 'op-1', conversationId: 'c1', args: args as unknown as Record<string, unknown> }

let state: string
let ends: OperationEnd[]
let merges: MergeAsk[]
let outcome: MergeBranchResult
const deps = () => ({
  async start() {
    if (state !== 'WAITING_FOR_APPROVAL') return false
    state = 'RUNNING'
    return true
  },
  async settle(_id: string, end: OperationEnd) {
    ends.push(end)
    state = end.state
    return true
  },
  merge: async (ask: MergeAsk) => { merges.push(ask); return outcome },
})

beforeEach(() => {
  world.members = new Set(['member'])
  world.branchOpen = true
  world.appended = []
  state = 'WAITING_FOR_APPROVAL'
  ends = []
  merges = []
  outcome = { outcome: 'merged', versionNumber: 15, branchClosed: true }
})

describe('who may answer a merge card', () => {
  it('a Member or Admin, by their own press', async () => {
    expect(await mergeAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'member', 'card')).toBeNull()
    expect(await mergeAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'decline', 'member', 'turn')).toBeNull()
  })

  it('never an approval the agent passes on from someone\'s words', async () => {
    expect(await mergeAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'member', 'turn')).toBe(MERGE_BY_PRESS)
  })

  it('not a Viewer, nor anyone outside the project', async () => {
    expect(await mergeAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'approve', 'viewer', 'card')).toMatch(/Member or Admin/)
    expect(await mergeAnswerRefusal({ boundaryType: 'project', boundaryId: 'p1' }, 'decline', 'viewer', 'card')).toMatch(/Nothing was changed/)
  })
})

describe('pressing Merge', () => {
  it('merges as the person who pressed, onto the main the card was made against', async () => {
    await answerMergeCard(row, 'approve', 'member', deps())
    expect(merges).toHaveLength(1)
    expect(merges[0]).toMatchObject({ personId: 'member', expectedMain: MAIN, message: args.message, logicalSiteId: 'site-1' })
    expect(ends).toEqual([{ state: 'COMPLETED', result: { summary: 'Merged add-login-page into main as v15, and closed the branch.' } }])
  })

  it('merges nothing for someone who may not merge here, even if they reach the answer', async () => {
    await expect(answerMergeCard(row, 'approve', 'viewer', deps())).rejects.toMatchObject({ statusCode: 403 })
    expect(merges).toHaveLength(0)
    expect(state).toBe('WAITING_FOR_APPROVAL')
  })

  it('a second press does nothing', async () => {
    await answerMergeCard(row, 'approve', 'member', deps())
    await expect(answerMergeCard(row, 'approve', 'member', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(merges).toHaveLength(1)
  })

  it('refuses a stale card: main moved since the agent asked, nothing is merged, and the dialog is offered', async () => {
    outcome = { outcome: 'main_moved' }
    await answerMergeCard(row, 'approve', 'member', deps())
    expect(ends).toEqual([{ state: 'FAILED', error: expect.stringContaining('main has changed since Kernel asked') }])
    expect(world.appended).toEqual([expect.objectContaining({
      kind: 'ACTION',
      body: expect.objectContaining({ target: { kind: 'branch', id: 'w1', label: 'add-login-page', params: { branch: 'add-login-page' } } }),
    })])
  })

  it('merges nothing once the branch is closed', async () => {
    world.branchOpen = false
    await expect(answerMergeCard(row, 'approve', 'member', deps())).rejects.toMatchObject({ statusCode: 409 })
    expect(merges).toHaveLength(0)
    expect(ends[0]).toMatchObject({ state: 'FAILED' })
  })

  it('says a clash merged nothing, and that the agent was asked to bring the branch up to date', async () => {
    outcome = { outcome: 'clash', clashes: [{ path: 'src/login.ts', version: null }], agentAsked: true }
    await answerMergeCard(row, 'approve', 'member', deps())
    expect(ends[0]).toMatchObject({ state: 'COMPLETED', result: { summary: expect.stringMatching(/^Nothing was merged: 1 file changed on main too\. Kernel was asked/) } })
  })
})

describe('pressing Not now', () => {
  it('merges nothing and ends the card, with no report of its own: the lead answers it', async () => {
    await answerMergeCard(row, 'decline', 'member', deps())
    expect(merges).toHaveLength(0)
    expect(ends).toEqual([{ state: 'CANCELLED', noReport: true, result: { summary: 'Not now: add-login-page was not merged into main. Nothing was changed.' } }])
  })
})
