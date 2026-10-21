import { prisma } from 'wasp/server'
import { displayRunStateReason } from '../agents/taskDisplayReason'

interface ReasonTask {
  projectId: string
  runState: string
  runStateReason: string | null
}

const VERSION_MISMATCH = 'VERSION_MISMATCH'

/**
 * Swaps each held task's stored reason for the one a person should read
 * (R-033). The stored reason is untouched in the database; only the copy that
 * leaves hq changes. A held task on a site hq refuses for its protocol version
 * is waiting for an upgrade, not a reconnect, and only the project's site
 * knows which — so the site's status is looked up, and only when some task in
 * the batch is actually held, which is rare enough that the ordinary read pays
 * nothing.
 */
export async function withDisplayReasons<T extends ReasonTask>(tasks: T[]): Promise<T[]> {
  const heldProjectIds = new Set<string>()
  for (const t of tasks) {
    // Asking the helper "what if the site were mismatched" finds held tasks
    // without restating which reason and state make a task held.
    if (displayRunStateReason(t, VERSION_MISMATCH) !== t.runStateReason) heldProjectIds.add(t.projectId)
  }
  if (heldProjectIds.size === 0) return tasks

  const mismatched = await prisma.project.findMany({
    where: { id: { in: [...heldProjectIds] }, executionSite: { status: VERSION_MISMATCH } },
    select: { id: true },
  })
  if (mismatched.length === 0) return tasks
  const mismatchedIds = new Set(mismatched.map((p: { id: string }) => p.id))

  return tasks.map(t => mismatchedIds.has(t.projectId)
    ? { ...t, runStateReason: displayRunStateReason(t, VERSION_MISMATCH) }
    : t)
}

export async function withDisplayReason<T extends ReasonTask>(task: T | null): Promise<T | null> {
  if (!task) return task
  const [shown] = await withDisplayReasons([task])
  return shown
}
