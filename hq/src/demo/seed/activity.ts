import { randomUUID } from 'node:crypto'
import { idFor, type SeedRun } from '@agenthix/core'
import type { SeedContext } from './types'

/** A run that finished with its answer stated it as its result; one that failed or stopped to ask stated none. */
const stated = (run: SeedRun): run is SeedRun & { output: string } => run.status === 'COMPLETED' && !run.endsWith && !!run.output

/**
 * hq's half of the sessions (who and where; the site holds the same session's runs and transcript under the same id),
 * the tasks they ran, the conversations in Chat and the notifications. Conversations are sealed with hq's key as hq
 * seals them, and carry the turn id a person's message needs so hq's recovery sweep never answers one: that sweep would
 * reach a model, and the demo's has none to reach.
 */
export async function seedActivity(c: SeedContext): Promise<void> {
  const { db, ids } = c
  const a = c.seed.activity
  const runsOf = new Map<string, number>()
  for (const s of a.sessions) {
    const taskId = idFor(ids.tasks, s.task, 'task')
    const projectKey = c.seed.organisation.tasks.find(t => t.key === s.task)!.project
    const userId = idFor(ids.people, s.person, 'person')
    const createdAt = c.at(s.at)
    await db.agentSession.create({
      data: {
        id: s.id, sessionKey: s.sessionKey, agentId: idFor(ids.agents, s.agent, 'agent'), userId, title: s.title, sessionType: 'task', taskId,
        model: a.model, primaryOwnerType: 'project', primaryOwnerId: idFor(ids.projects, projectKey, 'project'), createdAt, updatedAt: createdAt,
      },
    })
    const number = (runsOf.get(taskId) ?? 0) + 1
    runsOf.set(taskId, number)
    const startedBy = c.seed.organisation.tasks.find(t => t.key === s.task)!.runStartedBy ?? 'person'
    await db.task.update({
      where: { id: taskId },
      data: { runId: s.run.id, runStartedBy: startedBy, queuedByUserId: userId, runOnBehalfOfUserId: userId, lastWorkedAt: createdAt, runCount: number },
    })
    // Its number (a task's runs counted in the order listed) and result, as a run's start and its set_result record
    // them (taskRunResults.ts, runResults.ts), so its task shows Run 1 and what it achieved.
    const result = stated(s.run) ? s.run.output : null
    await db.runResult.create({
      data: { runId: s.run.id, siteId: c.siteLogicalId, sessionId: s.id, taskId, number, result, stated: result !== null, createdAt: c.at(s.run.at) },
    })
  }

  for (const v of a.conversations) {
    const asked = c.at(v.at)
    const answered = new Date(asked.getTime() + 40_000)
    const turnId = randomUUID()
    const sealed = (text: string) => c.deps.seal(JSON.stringify({ text }))
    const openedById = idFor(ids.people, v.openedBy, 'person')
    const agentId = v.agent === 'kernel' ? c.kernelId : idFor(ids.agents, v.agent, 'agent')
    await db.conversation.create({
      data: {
        id: v.id, home: v.project ? 'PROJECT' : 'PERSON', projectId: v.project ? idFor(ids.projects, v.project, 'project') : null,
        openedById, agentId, title: v.title, lastSeq: 2, lastMessageAt: answered, createdAt: asked,
        messages: {
          create: [
            { seq: 1, role: 'PERSON', kind: 'TEXT', authorId: openedById, turnId, body: sealed(v.asked), createdAt: asked },
            { seq: 2, role: 'AGENT', kind: 'TEXT', agentId, turnId, body: sealed(v.answer), createdAt: answered },
          ],
        },
      },
    })
  }

  if (a.notifications.length) {
    await db.notification.createMany({
      data: a.notifications.map(n => ({
        userId: idFor(ids.people, n.person, 'person'), type: n.type, title: n.title, body: n.body, actionLabel: n.actionLabel, actionUrl: n.actionUrl, createdAt: c.at(n.at),
      })),
    })
  }
}
