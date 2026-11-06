/**
 * A worker's slot is its conversation, boundary, person and workspace (owner decision, area 7): a brief naming a
 * workspace has a worker of its own there, and two made at once for one slot make one, a slot with no workspace too
 * (made under the slot's lock, which the unique row cannot do for a null workspace).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; conversationId: string; primaryOwnerType: string; primaryOwnerId: string; userId: string; primaryWorkspaceId: string | null; workerGeneration: number; status: string; closedReason: null }

const db = vi.hoisted(() => {
  const state = { rows: [] as Row[], locks: [] as string[], chain: Promise.resolve() as Promise<unknown> }
  const matches = (where: Partial<Row>) => (r: Row) => (Object.keys(where) as (keyof Row)[]).every(k => r[k] === where[k])
  const agentSession = {
    findFirst: async ({ where }: { where: Partial<Row> }) =>
      state.rows.filter(matches(where)).sort((a, b) => b.workerGeneration - a.workerGeneration)[0] ?? null,
    create: async ({ data }: { data: Omit<Row, 'id' | 'status' | 'closedReason'> }) => {
      const row = { ...data, id: `s${state.rows.length + 1}`, status: 'ACTIVE', closedReason: null } as Row
      state.rows.push(row)
      return row
    },
  }
  return Object.assign(state, { agentSession })
})
vi.mock('wasp/server', () => ({
  prisma: {
    agentSession: db.agentSession,
    // One transaction at a time, as the slot's advisory lock makes them.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = db.chain.then(() => fn({
        agentSession: db.agentSession,
        $executeRaw: async (_s: TemplateStringsArray, key: string) => { db.locks.push(key) },
      }))
      db.chain = run.catch(() => {})
      return run
    },
  },
}))
vi.mock('../../../../agents/dispatchService', () => ({ resolveSiteIdForSession: vi.fn(async () => 'site') }))
vi.mock('../../../../agents/dispatchPayloads', () => ({ toSeed: (s: unknown) => s }))
vi.mock('../../../../agents/runModel', () => ({ chooseBoundaryRun: vi.fn(async () => ({ runtime: 'claude-sdk' })) }))
const seeded = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../../../sessions/siteRuntimeStore', () => ({ createSession: seeded }))

import { findWorker, slotOf, standingWorker } from '../standingWorker'

const slot = (workspaceId: string | null) => ({ conversationId: 'c1', boundary: { type: 'project' as const, id: 'p1' }, personId: 'u1', workspaceId })
const agent = { id: 'a1' }

beforeEach(() => { db.rows = []; db.locks = []; seeded.mockClear() })

describe("a conversation's worker in a workspace", () => {
  it('is its own worker, apart from the place\'s files and from another workspace', async () => {
    const files = await standingWorker(slot(null), agent, 'Tidy the notes')
    const code = await standingWorker(slot('w1'), agent, 'Build the login page')
    const other = await standingWorker(slot('w2'), agent, 'Fix the footer')
    expect(new Set([files.id, code.id, other.id]).size).toBe(3)
    expect(code.primaryWorkspaceId).toBe('w1')
    expect(files.primaryWorkspaceId).toBeNull()
    expect((await standingWorker(slot('w1'), agent, 'Again'))!.id).toBe(code.id)
    expect(slotOf(code)).toEqual(slot('w1'))
    expect((await findWorker(slot('w2')))!.id).toBe(other.id)
  })

  it('two made at once for one slot make one, with or without a workspace', async () => {
    for (const ws of [null, 'w1']) {
      const [a, b] = await Promise.all([standingWorker(slot(ws), agent, 'One'), standingWorker(slot(ws), agent, 'Two')])
      expect(a.id).toBe(b.id)
    }
    expect(db.rows).toHaveLength(2)
    expect(seeded).toHaveBeenCalledTimes(2)
    expect(new Set(db.locks).size).toBe(2)
  })
})
