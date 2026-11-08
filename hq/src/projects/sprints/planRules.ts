/**
 * Plan Sprint's rules (spec N1, D14, the Sprints design's planning screen), as pure functions: what the left list
 * shows after its search and filters, its rows grouped by epic, where a row dropped among others lands in the
 * project's one order, and what a ⋯ on a row offers. The order inside a sprint is the project's rank, so a place is
 * always said as the task to go after, or the one to go before.
 */
import type { TaskState } from '@agenthix/core'

export type PlanRow = {
  id: string
  key: string
  title: string
  state: TaskState
  epicId: string | null
  type: { id: string; name: string } | null
}

export type PlanFilter = { search: string; typeId: string | null; epicId: string | null }

export const NO_FILTER: PlanFilter = { search: '', typeId: null, epicId: null }

export function filterRows<R extends PlanRow>(rows: readonly R[], f: PlanFilter): R[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter(r =>
    (!q || r.title.toLowerCase().includes(q) || r.key.toLowerCase().includes(q))
    && (!f.typeId || r.type?.id === f.typeId)
    && (!f.epicId || r.epicId === f.epicId))
}

export type EpicGroup<R> = { epic: { id: string; key: string; title: string } | null; rows: R[] }

/** Rows under their epics, in the epics' order, then those in none; the rows keep their order. */
export function groupByEpic<R extends PlanRow>(rows: readonly R[], epics: ReadonlyArray<{ id: string; key: string; title: string }>): EpicGroup<R>[] {
  const groups: EpicGroup<R>[] = epics.map(epic => ({ epic, rows: rows.filter(r => r.epicId === epic.id) }))
  const known = new Set(epics.map(e => e.id))
  groups.push({ epic: null, rows: rows.filter(r => !r.epicId || !known.has(r.epicId)) })
  return groups.filter(g => g.rows.length > 0)
}

export type OrderPlace = { afterTaskId?: string; beforeTaskId?: string }

/**
 * Where a row dropped at `index` of `list` goes in the project's order: after the row above it, or, at the top,
 * before the first. The dragged row is left out of `list` first, so a drop beside its own place is no move.
 */
export function placeAt(list: readonly { id: string }[], draggedId: string, index: number): OrderPlace {
  const others = list.filter(r => r.id !== draggedId)
  const at = Math.max(0, Math.min(index, others.length))
  if (others.length === 0) return {}
  return at === 0 ? { beforeTaskId: others[0].id } : { afterTaskId: others[at - 1].id }
}

/**
 * A drop at `index` among the rows shown (`visible`, filtered or grouped, the dragged row among them when it is this
 * list's) as an index of the whole list without the dragged row: after the row shown above the drop, or before the one
 * shown below it, or at the end.
 */
export function wholeIndex(whole: readonly { id: string }[], visible: readonly { id: string }[], draggedId: string, index: number): number {
  const others = whole.filter(r => r.id !== draggedId)
  const above = visible.slice(0, index).filter(r => r.id !== draggedId).at(-1)
  if (above) return others.findIndex(r => r.id === above.id) + 1
  const below = visible.slice(index).find(r => r.id !== draggedId)
  if (below) return others.findIndex(r => r.id === below.id)
  return others.length
}

/**
 * Move up and Move down within one list, among the rows shown: the whole list's index (without the row) that puts it
 * just before the row shown above it, or just after the one shown below; null at the end it cannot pass.
 */
export function stepIndex(whole: readonly { id: string }[], visible: readonly { id: string }[], id: string, by: -1 | 1): number | null {
  const at = visible.findIndex(r => r.id === id)
  const neighbour = at < 0 ? undefined : visible[at + by]
  if (!neighbour) return null
  // Without the row, the neighbour above keeps its index and the one below moves up one: either way the row takes the
  // neighbour's index in the whole list, before the one above or after the one below.
  return whole.findIndex(r => r.id === neighbour.id)
}

/** The dashed slot's words: "Drops here, 3rd · moves to To do" (N1) for a Backlog task, else its place alone. */
export function dropSlotText(position: number, state: TaskState | null): string {
  const n = position + 1
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'
  return `Drops here, ${n}${suffix}${state === 'BACKLOG' ? ' · moves to To do' : ''}`
}

/** Moves `id` to `index` (counted without it) of `list`, or appends it from elsewhere: the lists as they show while a move saves. */
export function moved<R extends { id: string }>(list: readonly R[], row: R, index: number): R[] {
  const others = list.filter(r => r.id !== row.id)
  const at = Math.max(0, Math.min(index, others.length))
  return [...others.slice(0, at), row, ...others.slice(at)]
}
