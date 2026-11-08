/**
 * How a project's task types are used, for Settings › Task types (spec D10): each type's tasks, how many are open
 * (which keeps it from being archived), whether anything has ever used it (only a never-used type is deleted), and the
 * Library template version each came from. Read by anyone who can see the project.
 */
import { HttpError, prisma } from 'wasp/server'
import { titleOfName } from '../library/assetList/words'
import { requireProjectVisible } from './resourceEntitlement'

export type TaskTypeUse = {
  typeId: string
  /** Tasks not archived. */
  tasks: number
  /** Tasks neither Done nor archived. */
  open: number
  /** Any task (archived ones included) or board has used it. */
  used: boolean
  /** "Bug 1.0.0": the Library template version it was made from, as the list says it. */
  madeFrom: { title: string; version: string } | null
  /** By column id: the tasks it holds, archived ones included, since a column that holds any is not removed. */
  columns: Record<string, number>
}

export async function taskTypeUse(projectId: string): Promise<TaskTypeUse[]> {
  const types = await prisma.taskType.findMany({
    where: { projectId },
    select: { id: true, columns: { select: { id: true } }, _count: { select: { boards: true } }, madeFromVersion: { select: { version: true, asset: { select: { name: true } } } } },
  })
  const [all, live, open, held] = await Promise.all([
    prisma.task.groupBy({ by: ['typeId'], where: { projectId }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['typeId'], where: { projectId, archived: false }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['typeId'], where: { projectId, archived: false, state: { not: 'DONE' } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['columnId'], where: { projectId, columnId: { not: null } }, _count: { _all: true } }),
  ])
  const inColumn = new Map(held.map(r => [r.columnId, r._count._all]))
  const count = (rows: Array<{ typeId: string | null; _count: { _all: number } }>, id: string) => rows.find(r => r.typeId === id)?._count._all ?? 0
  return types.map(t => ({
    typeId: t.id,
    tasks: count(live, t.id),
    open: count(open, t.id),
    used: count(all, t.id) > 0 || t._count.boards > 0,
    madeFrom: t.madeFromVersion ? { title: titleOfName(t.madeFromVersion.asset.name), version: t.madeFromVersion.version } : null,
    columns: Object.fromEntries(t.columns.map(c => [c.id, inColumn.get(c.id) ?? 0])),
  }))
}

export const getTaskTypeUse = async (args: { projectId: string }, context: { user?: { id: string } | null }): Promise<TaskTypeUse[]> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (typeof args?.projectId !== 'string') throw new HttpError(400, 'A project id is required')
  await requireProjectVisible(args.projectId, context.user.id)
  return taskTypeUse(args.projectId)
}
