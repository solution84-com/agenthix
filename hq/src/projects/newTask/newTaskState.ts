import type { TaskTypeView } from '@agenthix/core'

export interface NewTaskValues {
  /** One of the project's types; '' until they are read, then Task. */
  typeId: string
  /** The column it was added from (N2); '' starts it in its type's Backlog column. */
  columnId: string
  title: string
  description: string
  agentId: string
  /** A picker value (`<providerId>/<model>`); '' follows the default. */
  modelChoice: string
  /** undefined: the project's only code workspace, as before; the page has no field for it. */
  workspaceId: string | null | undefined
  /** `YYYY-MM-DD`, or ''. */
  due: string
  /** A `datetime-local` value, or '': when Run at… starts it. */
  startsAt: string
  priority: string
  epicId: string
  /** Images pasted or dropped on the description, attached once the task is made. */
  files: File[]
}

/** What the address fills in: the epic (from an epic's Add a task), the type and the column (from a board's column). */
export interface NewTaskDefaults { epicId?: string; typeId?: string; columnId?: string }

/** The type a new task is when nothing else is asked for: Task. */
export function defaultTypeId(types: readonly TaskTypeView[], asked?: string): string {
  const open = types.filter(t => !t.archivedAt)
  return (open.find(t => t.id === asked) ?? open.find(t => t.kind === 'TASK') ?? open[0])?.id ?? ''
}

export function emptyNewTask(defaults: NewTaskDefaults = {}, types: readonly TaskTypeView[] = []): NewTaskValues {
  // A column from a board names its type.
  const owner = types.find(t => t.columns.some(c => c.id === defaults.columnId))
  const typeId = defaultTypeId(types, defaults.typeId ?? owner?.id)
  const type = types.find(t => t.id === typeId)
  return {
    typeId,
    columnId: defaults.columnId && type?.columns.some(c => c.id === defaults.columnId) ? defaults.columnId : '',
    title: '', description: '', agentId: '', modelChoice: '', workspaceId: undefined,
    due: '', startsAt: '', priority: 'MEDIUM', epicId: defaults.epicId ?? '', files: [],
  }
}

export const isEpicType = (types: readonly TaskTypeView[], typeId: string): boolean =>
  types.find(t => t.id === typeId)?.kind === 'EPIC'

/** An epic is never run: no model, no start time and no epic of its own; it may still have an agent, to manage it. */
export const showsRunFacts = (types: readonly TaskTypeView[], v: NewTaskValues): boolean => !isEpicType(types, v.typeId)

/** The model is chosen for an agent's runs, so it is offered only once an agent is, and never on an epic. */
export const showsModel = (types: readonly TaskTypeView[], v: NewTaskValues): boolean => v.agentId !== '' && showsRunFacts(types, v)

/**
 * Choosing another agent drops a model picked for the first. Choosing another type drops a column that is not one of
 * its own, and an epic drops what it cannot have.
 */
export function withChange(v: NewTaskValues, patch: Partial<NewTaskValues>, types: readonly TaskTypeView[]): NewTaskValues {
  const next = { ...v, ...patch }
  if (patch.agentId !== undefined && patch.agentId !== v.agentId) next.modelChoice = ''
  if (patch.typeId !== undefined && patch.typeId !== v.typeId) {
    const type = types.find(t => t.id === patch.typeId)
    if (!type?.columns.some(c => c.id === next.columnId)) next.columnId = ''
    if (type?.kind === 'EPIC') { next.epicId = ''; next.modelChoice = ''; next.startsAt = '' }
  }
  return next
}

export const canCreate = (v: NewTaskValues): boolean => v.title.trim() !== '' && v.typeId !== ''

/** What the next task starts from after *Create more*: a fresh form of the same type, in the same column and epic. */
export function freshAfterCreate(v: NewTaskValues, defaults: NewTaskDefaults, types: readonly TaskTypeView[]): NewTaskValues {
  return emptyNewTask({ ...defaults, typeId: v.typeId, columnId: v.columnId || undefined, epicId: v.epicId || undefined }, types)
}
