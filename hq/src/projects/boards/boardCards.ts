/**
 * A board's read as the board presenters draw it, and what a drop on it would do in words. Pure, so the screen and its
 * tests share one set of rules.
 */
import type { DropPlace, ViewCardData, ViewColumnData } from '@agenthix/ui/board'
import { ordinal } from '@agenthix/ui/board'
import type { BoardCard } from '../boardCardService'
import type { BoardRead } from '../boardViewService'
import type { BoardChoices } from '../boardChoices'
import type { ViewSpec } from './boardViewModel'

export function viewCard(c: BoardCard): ViewCardData {
  return {
    id: c.id, key: c.key, title: c.title, priority: c.priority, type: c.type, state: c.state, executionState: c.executionState,
    agent: c.agent ? { id: c.agent.id, name: c.agent.name, avatarUrl: c.agent.avatarUrl } : null,
    epicProgress: c.epicProgress ?? null,
  }
}

export function viewColumns(read: BoardRead): ViewColumnData[] {
  return read.columns.map(c => ({ key: c.key, name: c.name, state: c.state, count: c.count, cards: c.cards.map(viewCard) }))
}

/** The columns as they will be once a card is moved, drawn at once while the server writes it. */
export function movedColumns(columns: ViewColumnData[], cardId: string, to: string, neighbours: { afterTaskId: string | null; beforeTaskId: string | null }): ViewColumnData[] {
  const card = columns.flatMap(c => c.cards).find(c => c.id === cardId)
  if (!card) return columns
  return columns.map(c => {
    let cards = c.cards.filter(x => x.id !== cardId)
    if (c.key === to) {
      const at = neighbours.afterTaskId ? cards.findIndex(x => x.id === neighbours.afterTaskId) + 1
        : neighbours.beforeTaskId ? Math.max(0, cards.findIndex(x => x.id === neighbours.beforeTaskId)) : cards.length
      cards = [...cards.slice(0, at), card, ...cards.slice(at)]
    }
    return { ...c, cards, count: c.count + (c.key === to ? 1 : 0) - (c.cards.some(x => x.id === cardId) ? 1 : 0) }
  })
}

/** Where a task of a type lands when it is set to a state: the type's default column for it. */
export function defaultColumnFor(choices: BoardChoices | undefined, typeId: string | null | undefined, state: string): { id: string; name: string } | null {
  const type = choices?.types.find(t => t.id === typeId)
  const column = type?.columns.find(c => c.state === state && c.defaultForState) ?? type?.columns.find(c => c.state === state)
  return column ? { id: column.id, name: column.name } : null
}

/**
 * The slot's words: "Drops here · Triaged, 2nd"; on the task state board, a card going to another state says which of
 * its type's columns it lands in: "Lands in Accepted, Feature request's To do column".
 */
export function slotWords(spec: ViewSpec, choices: BoardChoices | undefined, columns: ViewColumnData[], card: ViewCardData, place: DropPlace): string {
  const target = columns.find(c => c.key === place.column)
  if (!target) return 'Drops here'
  if (spec.kind === 'STATE' && card.state !== target.key) {
    const lands = defaultColumnFor(choices, card.type?.id, target.key)
    if (lands && card.type) return `Lands in ${lands.name}, ${card.type.name}'s ${target.name} column`
  }
  return `Drops here · ${target.name}, ${ordinal(place.index + 1)}`
}

/** The columns folded to a strip until opened: those that finish the work. */
export function finishingColumn(spec: ViewSpec, column: ViewColumnData): boolean {
  return spec.kind === 'EXECUTION' ? column.key === 'FINISHED' : spec.kind !== 'FIELD' && column.state === 'DONE'
}

/** "No bug here", "No task here". */
export function emptyWords(spec: ViewSpec, choices: BoardChoices | undefined): string {
  const type = spec.kind === 'TYPE' ? choices?.types.find(t => t.id === spec.typeId) : undefined
  return `No ${type ? type.name.toLowerCase() : 'task'} here`
}
