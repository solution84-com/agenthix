/**
 * Every project's own task types, Task and Epic, each with the four state columns (adr-0174; core's
 * `builtInTaskTypes`). They are made with the project; `ensureBuiltInTaskTypes` also gives them to a project that has
 * none yet when it is first read (one made before them, or by a test fixture), without touching its tasks. One of each
 * per project, by the partial unique index on TaskType (schema.prisma), so two callers racing make only one.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { builtInTaskTypes, type TaskTypeKind } from '@agenthix/core'

type Db = Pick<Prisma.TransactionClient, 'taskType'>

type BuiltInKind = Extract<TaskTypeKind, 'TASK' | 'EPIC'>

function typeCreate(i: number, t: ReturnType<typeof builtInTaskTypes>[number]) {
  return {
    name: t.name,
    icon: t.icon,
    kind: t.kind,
    order: i,
    columns: { create: t.columns.map((c, order) => ({ name: c.name, colour: c.colour, state: c.state, defaultForState: c.defaultForState, order })) },
  }
}

/** For a nested create with the project: `taskTypes: { create: builtInTaskTypesCreate() }`. */
export function builtInTaskTypesCreate() {
  return builtInTaskTypes().map((t, i) => typeCreate(i, t))
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002'
}

/** The project's Task and Epic types' ids, made first if it has either missing. */
export async function ensureBuiltInTaskTypes(projectId: string, db: Db = prisma): Promise<Record<BuiltInKind, string>> {
  const read = async () => {
    const rows = await db.taskType.findMany({ where: { projectId, kind: { in: ['TASK', 'EPIC'] } }, select: { id: true, kind: true } })
    return new Map(rows.map(r => [r.kind, r.id]))
  }
  let found = await read()
  const missing = builtInTaskTypes().map((t, i) => ({ t, i })).filter(({ t }) => !found.has(t.kind))
  for (const { t, i } of missing) {
    try {
      await db.taskType.create({ data: { projectId, ...typeCreate(i, t) } })
    } catch (err) {
      // Another caller made it first, or the project already has a type of that name: read what is there.
      if (!isUniqueViolation(err)) throw err
    }
  }
  if (missing.length) found = await read()
  const task = found.get('TASK')
  const epic = found.get('EPIC')
  // A project holding a type of its own named Task or Epic blocks the built-in one; that is a fault to see, not hide.
  if (!task || !epic) throw new Error(`project ${projectId} has no ${task ? 'Epic' : 'Task'} type and none could be made`)
  return { TASK: task, EPIC: epic }
}
