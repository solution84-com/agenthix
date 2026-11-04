/**
 * A request still listed under Needs you after it stopped waiting — answered
 * before the notifications cleared themselves, or by a path that does not clear
 * them — is handled when the list is read. A tool request waits only while its
 * task is blocked and the newest run of its session is pending approval on the
 * site; a "needs you" notice
 * only while its task is blocked or failed. A site that cannot be asked leaves
 * the request as it is: it is never cleared on a guess.
 */
import { prisma } from 'wasp/server'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { taskKeyOf } from './notificationKinds'

type Open = { id: string; type: string; actionUrl: string | null }

export async function staleRequestIds(open: Open[]): Promise<string[]> {
  const keys = [...new Set(open.map(n => taskKeyOf(n.actionUrl)).filter((k): k is string => !!k))]
  if (keys.length === 0) return []
  const tasks = await prisma.task.findMany({
    where: { OR: keys.map((key) => { const [project, number] = key.split('-'); return { project: { key: project }, number: Number(number) } }) },
    select: { id: true, number: true, runState: true, project: { select: { key: true } }, session: true },
  })
  const byKey = new Map(tasks.map(t => [`${t.project.key}-${t.number}`, t]))
  const stale: string[] = []
  for (const n of open) {
    const task = byKey.get(taskKeyOf(n.actionUrl) ?? '')
    // A task deleted since: nothing can answer its request, and a missing row is certain, unlike an unreachable site.
    if (!task) {
      if (n.type === 'task_waiting' || n.type === 'tool_approval') stale.push(n.id)
      continue
    }
    if (n.type === 'task_waiting' && task.runState !== 'RUN_BLOCKED' && task.runState !== 'RUN_FAILED') stale.push(n.id)
    // A task that is not blocked was dismissed, run again or settled otherwise: its request was replaced.
    if (n.type === 'tool_approval' && (task.runState !== 'RUN_BLOCKED' || (await requestAnswered(task.session)))) stale.push(n.id)
  }
  return stale
}

async function requestAnswered(session: Parameters<typeof dispatchService.resolveSiteIdForSession>[0] & { id: string } | null): Promise<boolean> {
  if (!session) return true
  try {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    // Only the newest run's request can still wait: anything newer replaced an older one.
    const [newest] = await siteRuntimeStore.listRuns(siteId, { sessionId: session.id, limit: 1 })
    return newest?.manifestStatus !== 'PENDING_APPROVAL'
  } catch {
    return false
  }
}
