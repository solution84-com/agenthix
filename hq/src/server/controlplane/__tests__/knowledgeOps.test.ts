/**
 * The knowledge tools for a worker's run (agent knowledge spec, part 3 *Serving*; part 4 *Who reaches what*): what a
 * call reaches is built from the run's capability alone — its one place, its person, its agent and run — and a run
 * that may change no files may change no knowledge. A turn and a connection are refused here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  actingPerson: vi.fn(),
  search: vi.fn(async (_reach: unknown, _params: unknown) => 'search text'),
  read: vi.fn(async (_reach: unknown, _params: unknown) => 'read text'),
  write: vi.fn(async (_reach: unknown, _params: unknown) => 'Done.'),
  edit: vi.fn(async (_reach: unknown, _params: unknown) => 'Done.'),
  del: vi.fn(async (_reach: unknown, _params: unknown) => 'Done.'),
}))

vi.mock('wasp/server', () => ({ prisma: { project: { findUnique: h.findUnique } } }))
vi.mock('../runPerson', () => ({ actingPerson: h.actingPerson }))
vi.mock('../../../knowledge', () => ({
  searchKnowledge: h.search, readKnowledge: h.read, writeKnowledge: h.write, editKnowledge: h.edit, deleteKnowledge: h.del,
}))

import {
  deleteKnowledgeOp, editKnowledgeOp, readKnowledgeOp, searchKnowledgeOp, writeKnowledgeOp,
} from '../knowledgeOps'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { turnCaller } from './turnFixtures'

const WRITES = { bypassed: false, allowedTools: [{ name: 'write_file', state: 'always' as const }], allowedBashPatterns: [], neverTools: [] }
const READS_ONLY = { bypassed: false, allowedTools: [{ name: 'read_file', state: 'always' as const }], allowedBashPatterns: [], neverTools: [] }

function run(overrides: Partial<CapabilityClaims> = {}): CallerContext {
  return {
    kind: 'run',
    claims: {
      tokenType: 'capability', userId: 'u-owner', runner: { kind: 'project', projectId: 'p1' }, startedBy: 'person',
      agentId: 'agent-1', sessionId: 's1', projectId: 'p1', workspaceId: null, taskId: 't1', role: null,
      siteId: 'site-1', permissions: WRITES, ...overrides,
    },
  }
}

const shop = { id: 'p1', slug: 'shop', key: 'SHP', personalOwnerId: null, personalSpace: false }

beforeEach(() => {
  vi.clearAllMocks()
  h.findUnique.mockResolvedValue(shop)
  h.actingPerson.mockResolvedValue({ userId: 'u-person', role: 'MEMBER' })
})

const reachOf = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0]

describe("a run's reach comes from its capability alone @SC-1408", () => {
  it("holds only the run's one place, its person, its agent and its run, keyed by the run", async () => {
    const answer = await searchKnowledgeOp(run(), { pattern: 'deploy', runId: 'run-7' })
    expect(answer).toBe('search text')
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }))
    expect(reachOf(h.search)).toEqual({
      places: [{ level: 'shop', owner: { ownerType: 'project', ownerId: 'p1' } }],
      userId: 'u-person',
      agent: { agentId: 'agent-1', runId: 'run-7' },
      mayChange: true,
      callerKey: 'run-7',
    })
  })

  it("passes the tool's own input on, without the run's id", async () => {
    await readKnowledgeOp(run(), { page: 'shop:processes/release.md', offset: 10, runId: 'run-7' })
    expect(h.read.mock.calls[0][1]).toEqual({ page: 'shop:processes/release.md', offset: 10 })
  })

  it('never takes a place from the call: a page or scope naming another place adds nothing', async () => {
    await searchKnowledgeOp(run(), { pattern: 'x', scope: 'payroll', runId: 'run-7' })
    await readKnowledgeOp(run(), { page: 'payroll:secret.md', runId: 'run-7' })
    for (const fn of [h.search, h.read]) {
      expect(reachOf(fn).places).toEqual([{ level: 'shop', owner: { ownerType: 'project', ownerId: 'p1' } }])
    }
    expect(h.findUnique).toHaveBeenCalledTimes(2)
    expect(h.findUnique.mock.calls.every(c => c[0].where.id === 'p1')).toBe(true)
  })

  it("a chat in a person's own storage reaches their own space, as personal", async () => {
    await searchKnowledgeOp(run({ projectId: null, taskId: null, runner: { kind: 'person', userId: 'u-owner' } }), { pattern: 'x', runId: 'r' })
    expect(reachOf(h.search).places).toEqual([{ level: 'personal', owner: { ownerType: 'user', ownerId: 'u-owner' } }])
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it("a run in a person's space project reaches their own storage, as personal", async () => {
    h.findUnique.mockResolvedValue({ ...shop, personalOwnerId: 'u-owner', personalSpace: true })
    await searchKnowledgeOp(run(), { pattern: 'x', runId: 'r' })
    expect(reachOf(h.search).places).toEqual([{ level: 'personal', owner: { ownerType: 'user', ownerId: 'u-owner' } }])
  })

  it('a run whose project is gone, or whose token names no place, reaches no place', async () => {
    h.findUnique.mockResolvedValue(null)
    await searchKnowledgeOp(run(), { pattern: 'x', runId: 'r' })
    await searchKnowledgeOp(run({ projectId: null, taskId: 't1', runner: { kind: 'project', projectId: 'p1' } }), { pattern: 'x', runId: 'r' })
    expect(h.search.mock.calls.map(c => (c[0] as { places: unknown[] }).places)).toEqual([[], []])
  })
})

describe('changing knowledge from a run @SC-1408', () => {
  it('a run with write tools may change', async () => {
    for (const op of [writeKnowledgeOp, editKnowledgeOp, deleteKnowledgeOp]) await op(run(), { page: 'shop:a.md', runId: 'r' })
    for (const fn of [h.write, h.edit, h.del]) expect(reachOf(fn).mayChange).toBe(true)
  })

  it('a run without write tools may not: its reach says so, and the service refuses', async () => {
    await writeKnowledgeOp(run({ permissions: READS_ONLY }), { page: 'shop:a.md', content: 'x', runId: 'r' })
    await searchKnowledgeOp(run({ permissions: READS_ONLY }), { pattern: 'x', runId: 'r' })
    expect(reachOf(h.write).mayChange).toBe(false)
    expect(reachOf(h.search).mayChange).toBe(false)
  })

  it('a write tool never-listed is off even when approval is bypassed', async () => {
    const permissions = { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['write_file', 'edit_file', 'bash'] }
    await editKnowledgeOp(run({ permissions }), { page: 'shop:a.md', runId: 'r' })
    expect(reachOf(h.edit).mayChange).toBe(false)
  })
})

describe('refusals @SC-1408', () => {
  const refusal = async (p: Promise<unknown>, code: string) => {
    const err = await p.then(() => null, e => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe(code)
  }

  it("refuses a conversation's turn and a person's connection, which reach knowledge by their own path", async () => {
    await refusal(searchKnowledgeOp(turnCaller(), { pattern: 'x', runId: 'r' }), 'forbidden')
    await refusal(searchKnowledgeOp(connectionCaller(), { pattern: 'x', runId: 'r' }), 'forbidden')
    expect(h.search).not.toHaveBeenCalled()
  })

  it('refuses a call the site did not name its run for', async () => {
    await refusal(searchKnowledgeOp(run(), { pattern: 'x' }), 'invalid')
    expect(h.search).not.toHaveBeenCalled()
  })

  it("refuses a tool the agent's place never allows", async () => {
    const permissions = { ...WRITES, neverTools: ['delete_knowledge'] }
    await refusal(deleteKnowledgeOp(run({ permissions }), { page: 'shop:a.md', runId: 'r' }), 'forbidden')
    expect(h.del).not.toHaveBeenCalled()
  })

  it('refuses a run on behalf of no one, before the service is asked', async () => {
    h.actingPerson.mockRejectedValue(new ControlPlaneError('forbidden', 'no one'))
    await refusal(searchKnowledgeOp(run(), { pattern: 'x', runId: 'r' }), 'forbidden')
    expect(h.search).not.toHaveBeenCalled()
  })
})
