// Rows and frames the task-machine integration tests share. Each test file mocks `wasp/server`, the shared fakes
// and the channel's `onRunStatus` itself; the frames here are what a site sends.
import { expect, vi } from 'vitest'
import type { Agent } from '@prisma/client'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createTestTask } from '../../test/factories'

let seq = 0

/** An agent and an open project on the install's site, with a person the project's tasks are done on behalf of. */
export async function agentInProject(projectData: Record<string, unknown> = {}) {
  const project = await createProject({ name: 'P', ...projectData })
  const agent = await createAgent()
  const person = await createUser()
  return { project, agent, person }
}

export function addTask(
  where: { project: { id: string }; agent: Agent | null; person: { id: string } },
  data: Record<string, unknown> = {},
) {
  return createTestTask({
    data: {
      title: `Task ${++seq}`, projectId: where.project.id, number: seq, assignedAgentId: where.agent?.id ?? null,
      onBehalfOfUserId: where.person.id, runState: 'RUN_QUEUED', ...data,
    } as never,
  })
}

export async function stateOf(taskId: string) {
  return prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { runState: true, runStateReason: true, runId: true, runStartedBy: true } })
}

export async function statesOf(ids: string[]) {
  const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, runState: true } })
  const byId = new Map(rows.map(r => [r.id, r.runState as string]))
  return ids.map(id => byId.get(id))
}

/** A `run.status` frame as a site sends it. */
export function frame(taskId: string | null, runId: string, over: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return {
    runId, sessionId: `sess-${taskId}`, taskId, agentId: 'agent', agentHandle: 'agent',
    status: 'COMPLETED', error: null, sessionPatch: null, manifestPending: null, ...over,
  } as RunStatusEvent
}

/** Lets fire-and-forget starts (trigger-next) land. */
export const settle = () => new Promise(r => setTimeout(r, 30))

/**
 * Waits until the starts of these tasks have landed. Trigger-next claims a task (RUN_ACTIVE, no run yet) before it
 * returns but dispatches it without waiting; that dispatch records its run or, for a held site, puts the task back to
 * wait. A slow machine gets there later than any fixed wait, such as `settle`'s.
 */
export function startsLanded(taskIds: string[]): Promise<void> {
  return vi.waitFor(async () => {
    expect(await prisma.task.count({ where: { id: { in: taskIds }, runState: 'RUN_ACTIVE', runId: null } })).toBe(0)
  }, { timeout: 5_000, interval: 10 })
}

export { createAgent }
