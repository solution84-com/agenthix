import { idFor, seedIds, seedTime, type DemoSeed, type SeedRun, type SeedSession } from '@agenthix/core'
import type { Prisma } from '@prisma/client'
import type { SeedDb } from './types'

const audit = (safe: number) => ({
  totalCalls: safe, blocked: 0, bySeverity: { SAFE: safe, LOW: 0, MEDIUM: 0, HIGH: 0, FLAGGED: 0 }, flagged: [],
})

/** One run's length in the transcript: the answer, or the end the run came to, lands 90 seconds in. */
const RUN_SECONDS = 95

function manifestOf(run: SeedRun) {
  const end = run.endsWith
  if (end?.kind !== 'APPROVAL_REQUESTED') return {}
  return {
    manifestStatus: 'PENDING_APPROVAL' as const,
    pendingManifest: { tools: end.tools, bashPatterns: end.bashPatterns },
  }
}

/**
 * The site's half of the sessions (the same id and key as hq's row): the session, its run, the transcript, and the one
 * tool call. Rows only. Every id the data names is used as written, so hq's seed and this one agree.
 */
export async function seedSessions(db: SeedDb, seed: DemoSeed, now: Date): Promise<void> {
  const ids = seedIds(seed)
  for (const s of seed.activity.sessions) await seedSession(db, seed, ids, s, now)
}

async function seedSession(db: SeedDb, seed: DemoSeed, ids: ReturnType<typeof seedIds>, s: SeedSession, now: Date): Promise<void> {
  const task = seed.organisation.tasks.find(t => t.key === s.task)!
  const taskId = idFor(ids.tasks, s.task, 'task')
  const agentId = idFor(ids.agents, s.agent, 'agent')
  const userId = idFor(ids.people, s.person, 'person')
  const projectId = idFor(ids.projects, task.project, 'project')
  const createdAt = seedTime(now, s.at)
  const run = s.run
  const startedAt = seedTime(now, run.at)
  const endedAt = new Date(startedAt.getTime() + RUN_SECONDS * 1000)

  await db.agentSession.create({
    data: {
      id: s.id, sessionKey: s.sessionKey, agentId, userId, title: s.title, sessionType: 'task', taskId, model: seed.activity.model,
      primaryOwnerType: 'project', primaryOwnerId: projectId, createdAt, updatedAt: createdAt,
    },
  })
  await db.agentRun.create({
    data: {
      id: run.id, agentId, sessionId: s.id, taskId, rootRunId: run.id, model: seed.activity.model, inputText: run.input,
      createdAt: startedAt, startedAt, endedAt, status: run.status, outputText: run.status === 'FAILED' ? null : run.output,
      error: run.error ?? null, usage: { inputTokens: 18_400, outputTokens: 2_100, totalTokens: 20_500 },
      auditSummary: audit(run.tool ? 1 : 0), ...manifestOf(run),
    },
  })

  const at = (seconds: number) => new Date(startedAt.getTime() + seconds * 1000)
  const toolUseId = `toolu_${run.id.slice(0, 8)}`
  const entries: Prisma.TranscriptEntryCreateManyInput[] = [
    { sessionId: s.id, runId: run.id, createdAt: at(0), role: 'USER', authorId: userId, content: run.input },
  ]
  if (run.tool) {
    entries.push({ sessionId: s.id, runId: run.id, createdAt: at(20), role: 'TOOL', content: '', toolName: run.tool.name, toolInput: run.tool.input as object, toolOutput: run.tool.output, toolUseId })
    await db.toolCallLog.create({ data: { runId: run.id, toolName: run.tool.name, toolInput: run.tool.input as object, toolUseId, riskLevel: 'SAFE', createdAt: at(20) } })
  }
  if (run.endsWith?.kind === 'RUN_FAILED') {
    entries.push({ sessionId: s.id, runId: run.id, createdAt: at(90), role: 'SYSTEM', content: '', kind: 'RUN_FAILED', detail: { reason: run.endsWith.reason } })
  } else if (run.endsWith?.kind === 'APPROVAL_REQUESTED') {
    entries.push({ sessionId: s.id, runId: run.id, createdAt: at(90), role: 'SYSTEM', content: '', kind: 'APPROVAL_REQUESTED', detail: undefined })
  } else {
    entries.push({ sessionId: s.id, runId: run.id, createdAt: at(90), role: 'ASSISTANT', content: run.output ?? '', model: seed.activity.model })
  }
  await db.transcriptEntry.createMany({ data: entries })
}
