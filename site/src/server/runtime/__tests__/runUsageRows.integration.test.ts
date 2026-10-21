/**
 * `run.usage` against a real database: the sums, the groupings, the period and
 * the person a dispatch named, read back from rows written the way the runtime
 * writes them. Each test works under its own agent id, so rows from other files
 * sharing the database never enter a sum.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { sumRunUsage } from '../runUsageRows'

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

let agentId: string

beforeEach(() => {
  agentId = uniq('agent')
})

async function session(owner: { type: 'project' | 'user'; id: string } | null) {
  const id = uniq('session')
  await prisma.agentSession.create({
    data: {
      id,
      sessionKey: uniq('key'),
      agentId,
      userId: uniq('user'),
      sessionType: 'task',
      primaryOwnerType: owner?.type ?? null,
      primaryOwnerId: owner?.id ?? null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  })
  return id
}

async function run(sessionId: string, opts: {
  createdAt: string
  tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  onBehalfOf?: string
  model?: string
}) {
  const t = opts.tokens
  await prisma.agentRun.create({
    data: {
      sessionId,
      agentId,
      inputText: 'x',
      model: opts.model ?? 'claude-sonnet-5',
      status: 'COMPLETED',
      createdAt: new Date(opts.createdAt),
      startedAt: new Date(opts.createdAt),
      usage: t
        ? {
            inputTokens: t.input,
            outputTokens: t.output,
            cacheReadTokens: t.cacheRead ?? 0,
            cacheWriteTokens: t.cacheWrite ?? 0,
            totalTokens: t.input + t.output + (t.cacheRead ?? 0) + (t.cacheWrite ?? 0),
          }
        : undefined,
      metadata: { dispatch: { kind: 'task', startedBy: opts.onBehalfOf ? 'person' : 'pulse', ...(opts.onBehalfOf ? { onBehalfOfUserId: opts.onBehalfOf } : {}) } },
    },
  })
}

describe('run.usage sums runs on the site @SC-779', () => {
  it('sums one agent\'s runs, counting a run with no usage as a run with no tokens', async () => {
    const s = await session({ type: 'project', id: 'p1' })
    await run(s, { createdAt: '2026-10-01T10:00:00.000Z', tokens: { input: 100, output: 20, cacheRead: 5, cacheWrite: 1 } })
    await run(s, { createdAt: '2026-10-02T10:00:00.000Z', tokens: { input: 10, output: 2 } })
    await run(s, { createdAt: '2026-10-03T10:00:00.000Z' })

    const { rows, truncated } = await sumRunUsage({ by: 'agent', agentId })

    expect(truncated).toBe(false)
    expect(rows).toEqual([{
      agentId, sessionId: null, model: null, onBehalfOfUserId: null, ownerType: null, ownerId: null,
      runCount: 3, inputTokens: 110, outputTokens: 22, cacheReadTokens: 5, cacheWriteTokens: 1, totalTokens: 138,
      lastRunAt: '2026-10-03T10:00:00.000Z',
    }])
  })

  it('groups by session, model and the person the dispatch named', async () => {
    const s = await session({ type: 'project', id: 'p1' })
    await run(s, { createdAt: '2026-10-01T10:00:00.000Z', tokens: { input: 1, output: 1 }, onBehalfOf: 'ana' })
    await run(s, { createdAt: '2026-10-01T11:00:00.000Z', tokens: { input: 2, output: 2 }, onBehalfOf: 'ana' })
    await run(s, { createdAt: '2026-10-01T12:00:00.000Z', tokens: { input: 4, output: 4 } })
    await run(s, { createdAt: '2026-10-01T13:00:00.000Z', tokens: { input: 8, output: 8 }, model: 'claude-haiku-4-5' })

    const { rows } = await sumRunUsage({ by: 'session', agentId })

    const key = (r: (typeof rows)[number]) => `${r.sessionId}|${r.model}|${r.onBehalfOfUserId}`
    expect(Object.fromEntries(rows.map(r => [key(r), r.totalTokens]))).toEqual({
      [`${s}|claude-sonnet-5|ana`]: 6,
      [`${s}|claude-sonnet-5|null`]: 8,
      [`${s}|claude-haiku-4-5|null`]: 16,
    })
  })

  it("groups by the storage owner its sessions work in", async () => {
    const a = await session({ type: 'project', id: 'p1' })
    const b = await session({ type: 'project', id: 'p1' })
    const c = await session({ type: 'user', id: 'u1' })
    await run(a, { createdAt: '2026-10-01T10:00:00.000Z', tokens: { input: 1, output: 0 } })
    await run(b, { createdAt: '2026-10-02T10:00:00.000Z', tokens: { input: 2, output: 0 } })
    await run(c, { createdAt: '2026-10-03T10:00:00.000Z', tokens: { input: 4, output: 0 } })

    const { rows } = await sumRunUsage({ by: 'owner', agentId })

    expect(rows.map(r => ({ owner: `${r.ownerType}:${r.ownerId}`, runs: r.runCount, tokens: r.totalTokens, last: r.lastRunAt }))).toEqual([
      { owner: 'user:u1', runs: 1, tokens: 4, last: '2026-10-03T10:00:00.000Z' },
      { owner: 'project:p1', runs: 2, tokens: 3, last: '2026-10-02T10:00:00.000Z' },
    ])
  })

  it('counts only the runs created in the period, from since inclusive to until exclusive', async () => {
    const s = await session(null)
    await run(s, { createdAt: '2026-09-30T23:59:59.000Z', tokens: { input: 1, output: 0 } })
    await run(s, { createdAt: '2026-10-01T00:00:00.000Z', tokens: { input: 2, output: 0 } })
    await run(s, { createdAt: '2026-10-31T23:59:59.000Z', tokens: { input: 4, output: 0 } })
    await run(s, { createdAt: '2026-11-01T00:00:00.000Z', tokens: { input: 8, output: 0 } })

    const { rows } = await sumRunUsage({ by: 'agent', agentId, since: '2026-10-01T00:00:00.000Z', until: '2026-11-01T00:00:00.000Z' })

    expect(rows[0]).toMatchObject({ runCount: 2, totalTokens: 6 })
  })
})
