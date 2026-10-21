import { describe, it, expect } from 'vitest'
import { prisma } from '../../../test/db'
import * as sessionRows from '../sessionRows'
import * as runRows from '../runRows'
import * as transcriptRows from '../transcriptRows'
import * as toolCallRows from '../toolCallRows'
import type { SessionSeed } from '@agenthix/core'

// @SC-347 — the four runtime models (AgentSession, AgentRun, TranscriptEntry,
// ToolCallLog) land in site's own database with hq's exact shape and cascade
// behavior, proved against a real database.

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

function makeSeed(overrides: Partial<SessionSeed> = {}): SessionSeed {
  return {
    id: uniq('session'),
    sessionKey: uniq('key'),
    agentId: uniq('agent'),
    userId: uniq('user'),
    sessionType: 'chat',
    taskId: null,
    title: 'Original title',
    model: 'claude-sonnet-5',
    metadata: { foo: 'bar' },
    primaryOwnerType: null,
    primaryOwnerId: null,
    primaryWorkspaceId: null,
    runtime: 'claude-sdk',
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  }
}

/** Three runs on one session, oldest → newest, for ordering/limit assertions. */
async function createThreeRunFixture(sessionId: string, agentId: string) {
  const base = new Date('2026-02-01T00:00:00.000Z').getTime()
  const oldest = await prisma.agentRun.create({
    data: {
      sessionId,
      agentId,
      inputText: 'run 1',
      model: 'claude-sonnet-5',
      status: 'COMPLETED',
      createdAt: new Date(base),
    },
  })
  const middle = await prisma.agentRun.create({
    data: {
      sessionId,
      agentId,
      inputText: 'run 2',
      model: 'claude-sonnet-5',
      status: 'PENDING',
      createdAt: new Date(base + 1000),
    },
  })
  const newest = await prisma.agentRun.create({
    data: {
      sessionId,
      agentId,
      inputText: 'run 3',
      model: 'claude-sonnet-5',
      status: 'RUNNING',
      createdAt: new Date(base + 2000),
    },
  })
  return { oldest, middle, newest }
}

describe('runtime row modules (site) @SC-347', () => {
  it('upsertSessionFromSeed writes hq exact id/sessionKey/createdAt, and is idempotent on re-dispatch', async () => {
    const seed = makeSeed()

    await sessionRows.upsertSessionFromSeed(seed)

    const row = await prisma.agentSession.findUnique({ where: { id: seed.id } })
    expect(row).not.toBeNull()
    expect(row!.id).toBe(seed.id)
    expect(row!.sessionKey).toBe(seed.sessionKey)
    expect(row!.createdAt.toISOString()).toBe(seed.createdAt)
    expect(row!.title).toBe('Original title')

    // Re-dispatch with a mutated title in the seed — update: {} means creation
    // fields never change on re-dispatch, so the ORIGINAL title survives.
    await sessionRows.upsertSessionFromSeed({ ...seed, title: 'Mutated title' })

    const rowsForId = await prisma.agentSession.findMany({ where: { id: seed.id } })
    expect(rowsForId).toHaveLength(1)
    expect(rowsForId[0].title).toBe('Original title')
  })

  it('deleteSession cascades by sessionId — runs (including sub-runs), transcript entries and tool calls; false on a missing id', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const parentRun = await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'do the thing', model: 'claude-sonnet-5' },
    })
    await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        inputText: 'sub task',
        model: 'claude-sonnet-5',
        parentRunId: parentRun.id,
        rootRunId: parentRun.id,
      },
    })
    await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'USER', content: 'hello' },
    })
    await prisma.toolCallLog.create({
      data: { runId: parentRun.id, toolName: 'bash', toolInput: {}, riskLevel: 'SAFE' },
    })

    const deleted = await sessionRows.deleteSession(seed.id)
    expect(deleted).toBe(true)

    expect(await prisma.agentSession.findUnique({ where: { id: seed.id } })).toBeNull()
    expect(await prisma.agentRun.findMany({ where: { sessionId: seed.id } })).toHaveLength(0)
    expect(await prisma.transcriptEntry.findMany({ where: { sessionId: seed.id } })).toHaveLength(0)
    expect(await prisma.toolCallLog.findMany({ where: { runId: parentRun.id } })).toHaveLength(0)

    const secondDelete = await sessionRows.deleteSession(seed.id)
    expect(secondDelete).toBe(false)
  })

  it('listRuns(activeOnly) returns only PENDING/RUNNING, newest-first; countRuns matches', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    const { oldest, middle, newest } = await createThreeRunFixture(seed.id, seed.agentId)

    const active = await runRows.listRuns({ sessionId: seed.id, activeOnly: true })
    expect(active.map((r) => r.id)).toEqual([newest.id, middle.id])
    expect(active.every((r) => r.status === 'RUNNING' || r.status === 'PENDING')).toBe(true)

    const all = await runRows.listRuns({ sessionId: seed.id })
    expect(all.map((r) => r.id)).toEqual([newest.id, middle.id, oldest.id])

    const activeCount = await runRows.countRuns({ sessionId: seed.id, activeOnly: true })
    expect(activeCount).toEqual({ count: 2 })

    const totalCount = await runRows.countRuns({ sessionId: seed.id })
    expect(totalCount).toEqual({ count: 3 })
  })

  it('listRuns clamps a non-positive limit to 1, returning exactly the newest run — never inverted to oldest-first', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    const { newest } = await createThreeRunFixture(seed.id, seed.agentId)

    const negative = await runRows.listRuns({ sessionId: seed.id, limit: -1 })
    expect(negative.map((r) => r.id)).toEqual([newest.id])

    const zero = await runRows.listRuns({ sessionId: seed.id, limit: 0 })
    expect(zero.map((r) => r.id)).toEqual([newest.id])
  })

  it('clearSessionRuns removes runs and their tool calls but leaves transcript entries', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const run = await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'do it', model: 'claude-sonnet-5' },
    })
    await prisma.toolCallLog.create({
      data: { runId: run.id, toolName: 'bash', toolInput: {}, riskLevel: 'SAFE' },
    })
    await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'ASSISTANT', content: 'done' },
    })

    const removed = await sessionRows.clearSessionRuns(seed.id)
    expect(removed).toBe(1)

    expect(await prisma.agentRun.findMany({ where: { sessionId: seed.id } })).toHaveLength(0)
    expect(await prisma.toolCallLog.findMany({ where: { runId: run.id } })).toHaveLength(0)

    const remainingTranscript = await transcriptRows.listTranscript(seed.id)
    expect(remainingTranscript).toHaveLength(1)
    expect(remainingTranscript[0].content).toBe('done')
  })

  it('returned row dates are ISO strings, matching the inserted Date exactly', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const insertedAt = new Date('2026-03-05T12:34:56.000Z')
    const run = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        inputText: 'check dates',
        model: 'claude-sonnet-5',
        createdAt: insertedAt,
      },
    })
    await prisma.toolCallLog.create({
      data: { runId: run.id, toolName: 'read', toolInput: {}, riskLevel: 'LOW', createdAt: insertedAt },
    })
    await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'TOOL', content: 'result', createdAt: insertedAt },
    })

    const fetchedRun = await runRows.getRun(run.id)
    expect(typeof fetchedRun!.createdAt).toBe('string')
    expect(fetchedRun!.createdAt).toBe(insertedAt.toISOString())

    const toolCalls = await toolCallRows.listToolCalls(run.id)
    expect(toolCalls[0].createdAt).toBe(insertedAt.toISOString())

    const transcript = await transcriptRows.listTranscript(seed.id)
    expect(transcript[0].createdAt).toBe(insertedAt.toISOString())
  })

  it("serves a message's author, and none on a row without one @SC-519", async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    await prisma.transcriptEntry.create({ data: { sessionId: seed.id, role: 'USER', authorId: 'u-ana', content: 'hi', createdAt: new Date('2026-10-07T09:00:00Z') } })
    await prisma.transcriptEntry.create({ data: { sessionId: seed.id, role: 'ASSISTANT', content: 'hello', createdAt: new Date('2026-10-07T09:00:01Z') } })

    const transcript = await transcriptRows.listTranscript(seed.id)
    expect(transcript.map((t) => t.authorId)).toEqual(['u-ana', null])
  })

  it("serves the conversation's record: a row's run and kind, a waiting message's status, an approval's answer", async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    const decidedAt = new Date('2026-10-10T10:52:00Z')
    const asked = await prisma.agentRun.create({
      data: {
        sessionId: seed.id, agentId: seed.agentId, inputText: 'x', model: 'm', status: 'COMPLETED',
        manifestStatus: 'APPROVED', pendingManifest: { tools: [{ name: 'web_fetch' }], bashPatterns: [] }, manifestDecidedById: 'u-avery', manifestDecidedAt: decidedAt,
      },
    })
    const waiting = await prisma.agentRun.create({ data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'y', model: 'm', status: 'PENDING' } })
    await prisma.transcriptEntry.create({ data: { sessionId: seed.id, runId: asked.id, role: 'SYSTEM', kind: 'APPROVAL_REQUESTED', content: '', createdAt: new Date('2026-10-10T10:46:00Z') } })
    await prisma.transcriptEntry.create({ data: { sessionId: seed.id, runId: waiting.id, role: 'USER', content: 'Also the phone.', createdAt: new Date('2026-10-10T10:47:00Z') } })
    await prisma.transcriptEntry.create({ data: { sessionId: seed.id, runId: asked.id, role: 'SYSTEM', kind: 'RUN_FAILED', content: 'r', detail: { reason: 'r' }, createdAt: new Date('2026-10-10T10:48:00Z') } })

    const [approval, message, failure] = await transcriptRows.listTranscript(seed.id)
    expect(approval).toMatchObject({
      runId: asked.id, kind: 'APPROVAL_REQUESTED',
      approval: { status: 'APPROVED', request: { tools: [{ name: 'web_fetch' }], bashPatterns: [] }, decidedById: 'u-avery', decidedAt: decidedAt.toISOString(), reason: null },
    })
    expect(message).toMatchObject({ runId: waiting.id, kind: null, runStatus: 'PENDING' })
    expect(failure).toMatchObject({ kind: 'RUN_FAILED', detail: { reason: 'r' } })
    expect((await runRows.getRun(asked.id))!.manifestDecidedAt).toBe(decidedAt.toISOString())
  })

  it('rename and archive return false for a missing session id, true when applied', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    expect(await sessionRows.renameSession(seed.id, 'New Title')).toBe(true)
    expect((await prisma.agentSession.findUnique({ where: { id: seed.id } }))!.title).toBe('New Title')
    expect(await sessionRows.renameSession('does-not-exist', 'X')).toBe(false)

    expect(await sessionRows.archiveSession(seed.id)).toBe(true)
    expect((await prisma.agentSession.findUnique({ where: { id: seed.id } }))!.status).toBe('ARCHIVED')
    expect(await sessionRows.archiveSession('does-not-exist')).toBe(false)
  })

  it('deleteSessionsBy removes matching sessions and returns the count', async () => {
    const sharedAgentId = uniq('agent')
    const seedA = makeSeed({ agentId: sharedAgentId })
    const seedB = makeSeed({ agentId: sharedAgentId })
    const seedC = makeSeed()
    await sessionRows.upsertSessionFromSeed(seedA)
    await sessionRows.upsertSessionFromSeed(seedB)
    await sessionRows.upsertSessionFromSeed(seedC)

    const removed = await sessionRows.deleteSessionsBy({ agentId: sharedAgentId })
    expect(removed).toBe(2)

    expect(await prisma.agentSession.findUnique({ where: { id: seedA.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: seedB.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: seedC.id } })).not.toBeNull()
  })

  it('deleteSessionsBy: a composite selector deletes only the intersection; ids selector deletes exactly those', async () => {
    const sharedUserId = uniq('user')
    const sharedAgentId = uniq('agent')
    // Matches both userId and agentId — the intersection.
    const seedBoth = makeSeed({ userId: sharedUserId, agentId: sharedAgentId })
    // Matches userId only.
    const seedUserOnly = makeSeed({ userId: sharedUserId })
    // Matches agentId only.
    const seedAgentOnly = makeSeed({ agentId: sharedAgentId })
    await sessionRows.upsertSessionFromSeed(seedBoth)
    await sessionRows.upsertSessionFromSeed(seedUserOnly)
    await sessionRows.upsertSessionFromSeed(seedAgentOnly)

    const removed = await sessionRows.deleteSessionsBy({ userId: sharedUserId, agentId: sharedAgentId })
    expect(removed).toBe(1)
    expect(await prisma.agentSession.findUnique({ where: { id: seedBoth.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: seedUserOnly.id } })).not.toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: seedAgentOnly.id } })).not.toBeNull()

    const removedByIds = await sessionRows.deleteSessionsBy({ ids: [seedUserOnly.id, seedAgentOnly.id] })
    expect(removedByIds).toBe(2)
    expect(await prisma.agentSession.findUnique({ where: { id: seedUserOnly.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: seedAgentOnly.id } })).toBeNull()
  })

  it('upserts a session with primaryOwner triple + taskId; a second session claiming the same taskId violates the unique constraint', async () => {
    const seed = makeSeed({
      taskId: uniq('task'),
      primaryOwnerType: 'project',
      primaryOwnerId: 'proj-1',
      primaryWorkspaceId: 'ws-1',
    })
    await sessionRows.upsertSessionFromSeed(seed)

    const row = await prisma.agentSession.findUnique({ where: { id: seed.id } })
    expect(row).toMatchObject({
      taskId: seed.taskId,
      primaryOwnerType: 'project',
      primaryOwnerId: 'proj-1',
      primaryWorkspaceId: 'ws-1',
    })

    const conflicting = makeSeed({ taskId: seed.taskId })
    await expect(sessionRows.upsertSessionFromSeed(conflicting)).rejects.toThrow()
  })

  it('listRuns filters by taskId and agentId independently, and an explicit limit returns only the newest N', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const sharedTaskId = uniq('task')
    const otherAgentId = uniq('agent')
    const base = new Date('2026-04-01T00:00:00.000Z').getTime()

    const runA = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        taskId: sharedTaskId,
        inputText: 'a',
        model: 'claude-sonnet-5',
        createdAt: new Date(base),
      },
    })
    const runB = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: otherAgentId,
        taskId: sharedTaskId,
        inputText: 'b',
        model: 'claude-sonnet-5',
        createdAt: new Date(base + 1000),
      },
    })
    const runC = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        inputText: 'c',
        model: 'claude-sonnet-5',
        createdAt: new Date(base + 2000),
      },
    })

    const byTask = await runRows.listRuns({ taskId: sharedTaskId })
    expect(byTask.map((r) => r.id).sort()).toEqual([runA.id, runB.id].sort())

    const byAgent = await runRows.listRuns({ agentId: seed.agentId })
    expect(byAgent.map((r) => r.id).sort()).toEqual([runA.id, runC.id].sort())

    const limited = await runRows.listRuns({ sessionId: seed.id, limit: 2 })
    expect(limited.map((r) => r.id)).toEqual([runC.id, runB.id])
  })

  it('listTranscript and listToolCalls return multiple rows in ascending createdAt order; getRun returns null for a missing id', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    const run = await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'x', model: 'claude-sonnet-5' },
    })

    const base = new Date('2026-05-01T00:00:00.000Z').getTime()
    const entry1 = await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'USER', content: 'first', createdAt: new Date(base) },
    })
    const entry2 = await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'ASSISTANT', content: 'second', createdAt: new Date(base + 1000) },
    })
    const entry3 = await prisma.transcriptEntry.create({
      data: { sessionId: seed.id, role: 'ASSISTANT', content: 'third', createdAt: new Date(base + 2000) },
    })

    const transcript = await transcriptRows.listTranscript(seed.id)
    expect(transcript.map((t) => t.id)).toEqual([entry1.id, entry2.id, entry3.id])

    const call1 = await prisma.toolCallLog.create({
      data: { runId: run.id, toolName: 'bash', toolInput: {}, riskLevel: 'SAFE', createdAt: new Date(base) },
    })
    const call2 = await prisma.toolCallLog.create({
      data: { runId: run.id, toolName: 'read', toolInput: {}, riskLevel: 'LOW', createdAt: new Date(base + 1000) },
    })

    const calls = await toolCallRows.listToolCalls(run.id)
    expect(calls.map((c) => c.id)).toEqual([call1.id, call2.id])

    expect(await runRows.getRun('does-not-exist')).toBeNull()
  })

  it('deleting a parent run directly (not via the session) sets the sub-run\'s parentRunId to null instead of cascading', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const parentRun = await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'parent', model: 'claude-sonnet-5' },
    })
    const subRun = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        inputText: 'sub',
        model: 'claude-sonnet-5',
        parentRunId: parentRun.id,
        rootRunId: parentRun.id,
      },
    })

    await prisma.agentRun.delete({ where: { id: parentRun.id } })

    const survivingSubRun = await runRows.getRun(subRun.id)
    expect(survivingSubRun).not.toBeNull()
    expect(survivingSubRun!.parentRunId).toBeNull()
  })

  it('listTranscript(tail) returns the NEWEST N entries, still ascending — finding 1', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)

    const base = new Date('2026-06-01T00:00:00.000Z').getTime()
    const entries: Awaited<ReturnType<typeof prisma.transcriptEntry.create>>[] = []
    for (let i = 0; i < 7; i++) {
      entries.push(
        await prisma.transcriptEntry.create({
          data: { sessionId: seed.id, role: 'USER', content: `entry ${i}`, createdAt: new Date(base + i * 1000) },
        }),
      )
    }

    const tailed = await transcriptRows.listTranscript(seed.id, { limit: 3, tail: true })
    // The newest 3 (entries 4, 5, 6), still oldest→newest.
    expect(tailed.map((t) => t.id)).toEqual([entries[4].id, entries[5].id, entries[6].id])

    const untailed = await transcriptRows.listTranscript(seed.id, { limit: 3 })
    // The oldest 3 — proves tail actually flips which slice is chosen, not just the order.
    expect(untailed.map((t) => t.id)).toEqual([entries[0].id, entries[1].id, entries[2].id])
  })

  it('statsRuns aggregates status counts and per-agent tokens over every run, not a page — finding 3', async () => {
    const seed = makeSeed()
    await sessionRows.upsertSessionFromSeed(seed)
    const otherAgentId = uniq('agent')

    await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'a', model: 'claude-sonnet-5', status: 'COMPLETED', usage: { totalTokens: 100 } },
    })
    await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: seed.agentId, inputText: 'b', model: 'claude-sonnet-5', status: 'COMPLETED', usage: { totalTokens: 50 } },
    })
    await prisma.agentRun.create({
      data: { sessionId: seed.id, agentId: otherAgentId, inputText: 'c', model: 'claude-sonnet-5', status: 'FAILED', usage: { totalTokens: 10 } },
    })
    await prisma.agentRun.create({
      // No `usage` — a RUNNING run has none yet; omitted (not `usage: null`,
      // which Prisma's Json field type rejects as a plain JS null) leaves the
      // column NULL, same as the real writer.
      data: { sessionId: seed.id, agentId: otherAgentId, inputText: 'd', model: 'claude-sonnet-5', status: 'RUNNING' },
    })

    const stats = await runRows.statsRuns()

    expect(stats.totalRuns).toBeGreaterThanOrEqual(4)
    expect(stats.completedRuns).toBeGreaterThanOrEqual(2)
    expect(stats.failedRuns).toBeGreaterThanOrEqual(1)
    expect(stats.runningRuns).toBeGreaterThanOrEqual(1)

    const mine = stats.perAgent.find((p) => p.agentId === seed.agentId)
    expect(mine).toMatchObject({ runCount: 2, totalTokens: 150 })

    const other = stats.perAgent.find((p) => p.agentId === otherAgentId)
    // RUNNING run has null usage — contributes to runCount but not totalTokens.
    expect(other).toMatchObject({ runCount: 2, totalTokens: 10 })
  })

  it('metadata (session) and usage (run, TokenUsage shape) round-trip through their row mappers', async () => {
    const seed = makeSeed({ metadata: { theme: 'dark', tags: ['a', 'b'], nested: { count: 3 } } })
    await sessionRows.upsertSessionFromSeed(seed)

    const row = await prisma.agentSession.findUnique({ where: { id: seed.id } })
    expect(row!.metadata).toEqual({ theme: 'dark', tags: ['a', 'b'], nested: { count: 3 } })

    const usage = {
      inputTokens: 120,
      outputTokens: 45,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 180,
    }
    const run = await prisma.agentRun.create({
      data: {
        sessionId: seed.id,
        agentId: seed.agentId,
        inputText: 'usage check',
        model: 'claude-sonnet-5',
        usage,
      },
    })

    const fetchedRun = await runRows.getRun(run.id)
    expect(fetchedRun!.usage).toEqual(usage)
  })
})
