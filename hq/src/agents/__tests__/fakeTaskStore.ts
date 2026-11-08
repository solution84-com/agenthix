/**
 * An in-memory stand-in for `prisma.task`, enough of Prisma's `where` to drive
 * the task machine (TaskRunner, taskSlotClaim, the status listener, the move
 * rules) with the same conditional writes the database would apply. Used by the
 * run-state tests; the integration suites cover the real database.
 */
export type FakeTask = {
  id: string
  projectId: string
  assignedAgentId: string | null
  status: string
  runState: string
  runStateReason: string | null
  runId: string | null
  runStartedBy: string | null
  priority: string
  createdAt: Date
  archived: boolean
  scheduleAt: Date | null
  scheduleNextDueAt: Date | null
  [key: string]: unknown
}

type Where = Record<string, unknown>

function matchValue(actual: unknown, cond: unknown): boolean {
  if (cond === null) return actual === null
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime()
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>
    if ('in' in c) return (c.in as unknown[]).includes(actual)
    if ('notIn' in c) return !(c.notIn as unknown[]).includes(actual)
    if ('not' in c) return !matchValue(actual, c.not)
    const t = actual instanceof Date ? actual.getTime() : null
    const at = (v: unknown) => (v instanceof Date ? v.getTime() : Number.NaN)
    if ('lte' in c) return t !== null && t <= at(c.lte)
    if ('lt' in c) return t !== null && t < at(c.lt)
    if ('gte' in c) return t !== null && t >= at(c.gte)
    if ('gt' in c) return t !== null && t > at(c.gt)
    return true
  }
  return actual === cond
}

export function matches(task: FakeTask, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true
    if (key === 'OR') return (cond as Where[]).some(w => matches(task, w))
    if (key === 'AND') return (cond as Where[]).every(w => matches(task, w))
    if (key === 'NOT') return !matches(task, cond as Where)
    return matchValue(task[key], cond)
  })
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** The order every caller here asks for: priority, then age (`orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]`). */
function byPriorityThenAge(a: FakeTask, b: FakeTask): number {
  return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1) || a.createdAt.getTime() - b.createdAt.getTime()
}

function pick<T extends Record<string, unknown>>(row: T, select: Record<string, boolean> | undefined): Partial<T> {
  if (!select) return { ...row }
  return Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) as Partial<T>
}

export function createFakeTaskStore() {
  const rows = new Map<string, FakeTask>()
  let order = 0

  const add = (t: Partial<FakeTask> & { id: string }): FakeTask => {
    const row: FakeTask = {
      projectId: 'proj-1', assignedAgentId: 'agent-1', status: 'TODO', runState: 'RUN_NONE', runStateReason: null,
      runId: null, runStartedBy: null, queueDepth: 0, title: t.id, priority: 'MEDIUM', createdAt: new Date(1_000 + order++), archived: false,
      scheduleAt: null, scheduleNextDueAt: null,
      ...t,
    }
    rows.set(row.id, row)
    return row
  }

  const agentOf = (r: FakeTask) => (r.assignedAgentId ? { id: r.assignedAgentId, handle: r.assignedAgentId, name: r.assignedAgentId } : null)
  const findAll = (where: Where | undefined) =>
    [...rows.values()].filter(t => matches(t, where)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  const task = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = rows.get(where.id)
      return row ? pick(row, select) : null
    },
    findFirst: async ({ where, select }: { where?: Where; select?: Record<string, boolean> }) => {
      const row = findAll(where).sort(byPriorityThenAge)[0]
      return row ? pick(row, select) : null
    },
    findMany: async ({ where, select, include, distinct, orderBy }: {
      where?: Where; select?: Record<string, boolean>; include?: Record<string, unknown>; distinct?: string[]; orderBy?: unknown
    } = {}) => {
      let found = findAll(where)
      if (orderBy) found = found.sort(byPriorityThenAge)
      if (distinct) {
        const seen = new Set<string>()
        found = found.filter(r => {
          const key = distinct.map(k => String(r[k])).join(':')
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }
      return found.map(r => (include?.assignedAgent ? { ...pick(r, select), assignedAgent: agentOf(r) } : pick(r, select)))
    },
    count: async ({ where }: { where?: Where } = {}) => findAll(where).length,
    updateMany: async ({ where, data }: { where?: Where; data: Record<string, unknown> }) => {
      const hit = findAll(where)
      for (const row of hit) Object.assign(row, data)
      return { count: hit.length }
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows.get(where.id)
      if (!row) throw new Error(`no task ${where.id}`)
      Object.assign(row, data)
      return { ...row }
    },
  }

  return {
    task,
    add,
    get: (id: string) => rows.get(id)!,
    states: () => Object.fromEntries([...rows.values()].map(r => [r.id, r.runState])),
    clear: () => { rows.clear(); order = 0 },
  }
}
