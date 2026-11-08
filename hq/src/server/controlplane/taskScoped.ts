/** The scoping every task operation starts with — split from taskOps.ts so taskWriteOps.ts can share it. */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement, type ProjectUse } from './authorize'

/** Loads a task's scoping fields and checks the caller may reach it — the run's
 *  boundary and its person's membership of the task's project, as the browser
 *  checks the same task (ADR-0062, adr-0101) — before any op touches it.
 *  `use` is whether the op only reads the task or changes it (adr-0102). */
export async function loadTaskScoped(
  ctx: CallerContext,
  taskId: string,
  what: string,
  use: ProjectUse,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, runState: true },
  })
  if (!task) throw new ControlPlaneError('not_found', `Task ${taskId} not found`)
  await requireProjectEntitlement(ctx, task.projectId, what, use)
  return task
}
