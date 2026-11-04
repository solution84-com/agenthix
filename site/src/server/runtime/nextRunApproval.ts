/**
 * An approval is for the next run only (every-screen-reviewed spec §9). A run never waits for one: what needs it
 * is refused and listed, and the run ends with the list. Approving starts the next run of the task or the
 * conversation, and that run alone is given what was approved: it is carried forward only from the newest earlier
 * run of the session, so the run after it, and any run after an unanswered request, gets nothing. Starting a run
 * replaces every request still unanswered there.
 *
 * A task has one session, and every run of it — a task run or a message into its session — is in that session;
 * the task's own runs are matched by its id too, so a task run made in an earlier session counts.
 */
import { prisma } from '#db'
import type { DeferredManifest } from '../../agents/runtime/types'

export type RequestScope = { sessionId: string; taskId?: string | null; agentId?: string }

function inScope(scope: RequestScope) {
  return scope.taskId ? { OR: [{ sessionId: scope.sessionId }, { taskId: scope.taskId }] } : { sessionId: scope.sessionId }
}

/**
 * What a run starting now is given: the request approved on the newest earlier run, if that is what it was. A request
 * is an agent's, so a run of another agent (a task handed on) is given nothing of it.
 */
export async function approvalForNextRun(scope: RequestScope): Promise<DeferredManifest> {
  const newest = await prisma.agentRun.findFirst({
    where: inScope(scope),
    orderBy: { createdAt: 'desc' },
    select: { manifestStatus: true, pendingManifest: true, agentId: true },
  })
  if (newest?.manifestStatus !== 'APPROVED') return { tools: [], bashPatterns: [] }
  if (scope.agentId && newest.agentId !== scope.agentId) return { tools: [], bashPatterns: [] }
  const approved = newest.pendingManifest as Partial<DeferredManifest> | null
  return { tools: approved?.tools ?? [], bashPatterns: approved?.bashPatterns ?? [] }
}

/** Every unanswered request in the task or conversation is replaced by the run starting now. */
export async function replaceUnansweredRequests(scope: RequestScope): Promise<number> {
  const { count } = await prisma.agentRun.updateMany({
    where: { ...inScope(scope), manifestStatus: 'PENDING_APPROVAL' },
    data: { manifestStatus: 'SUPERSEDED', manifestDecidedAt: new Date() },
  })
  return count
}

/** Whether a run is still the newest of its task or conversation: only its request may then be approved. */
export async function isNewestRun(run: { id: string; sessionId: string; taskId: string | null }): Promise<boolean> {
  const newest = await prisma.agentRun.findFirst({
    where: inScope(run),
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return newest?.id === run.id
}

/** What the agent is told before the message of the run that was given an approval; empty when it was given none. */
export function approvalNote(approved: DeferredManifest): string {
  const names = [
    ...approved.tools.map(t => t.name).filter(Boolean),
    ...approved.bashPatterns.map(p => p.pattern).filter(Boolean).map(p => `the command \`${p}\``),
  ]
  if (names.length === 0) return ''
  return `[A person approved your request to use: ${names.join(', ')}. You may use it in this run only; after it, your usual permissions apply again.]\n\n`
}
