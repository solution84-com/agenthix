/**
 * What a card's ⋯ (and, on a phone, its long press) offers on a board (the board design, keys 7, 8, 11 and execution 3,
 * phone C): Open; the one run action its execution state allows (Run, Stop, Run again; an epic is never run); Move to ›
 * another column, greyed with why on the execution board, which the system moves; Move up and Move down on a phone,
 * where nothing is dragged; and Sprint ›. Needs you is answered on the task page, never from a card.
 */
import type { BoardMenuItem, ViewCardData, ViewColumnData } from '@agenthix/ui/board'
import type { BoardChoices } from '../boardChoices'

export const ASSIGN_AN_AGENT_FIRST = 'Assign an agent first'
export const THE_SYSTEM_MOVES_THESE = 'The system moves cards here'
const VIEWER_CANNOT = 'Viewers can look, not change: ask a project admin to make you a member.'

export interface CardMenuContext {
  columns: ViewColumnData[]
  readOnly: boolean
  /** The person may work in the project; a Viewer gets every change greyed with why. */
  mayWork: boolean
  choices: BoardChoices | undefined
  /** The sprint the card is in, for the check in Sprint ›. */
  sprintOf: (card: ViewCardData) => string | null
  phone: boolean
  on: {
    open: (card: ViewCardData) => void
    run: (card: ViewCardData) => void
    stop: (card: ViewCardData) => void
    openInRuns: (card: ViewCardData) => void
    moveTo: (card: ViewCardData, column: string, place: 'bottom' | { afterTaskId: string | null; beforeTaskId: string | null }) => void
    setSprint: (card: ViewCardData, sprintId: string | null) => void
  }
}

function runItem(card: ViewCardData, ctx: CardMenuContext): BoardMenuItem | null {
  if (card.type?.kind === 'EPIC') return null
  const why = !ctx.mayWork ? VIEWER_CANNOT : undefined
  switch (card.executionState) {
    case 'RUNNING':
    case 'WAITING':
      return { label: 'Stop', onSelect: () => ctx.on.stop(card), disabledReason: why }
    case 'FAILED':
      return { label: 'Run again', onSelect: () => ctx.on.run(card), disabledReason: why ?? (card.agent ? undefined : ASSIGN_AN_AGENT_FIRST) }
    case 'NEEDS_YOU':
      return null
    default:
      return { label: 'Run', onSelect: () => ctx.on.run(card), disabledReason: why ?? (card.agent ? undefined : ASSIGN_AN_AGENT_FIRST) }
  }
}

function columnOf(card: ViewCardData, columns: ViewColumnData[]): ViewColumnData | undefined {
  return columns.find(c => c.cards.some(x => x.id === card.id))
}

function moveItems(card: ViewCardData, ctx: CardMenuContext): BoardMenuItem[] {
  const here = columnOf(card, ctx.columns)
  const others = ctx.columns.filter(c => c.key !== here?.key)
  const why = ctx.readOnly ? THE_SYSTEM_MOVES_THESE : !ctx.mayWork ? VIEWER_CANNOT : undefined
  const moveTo: BoardMenuItem = {
    label: 'Move to', separatorBefore: true, disabledReason: why,
    hint: ctx.phone ? others.map(c => c.name).join(' · ') : undefined,
    choices: others.map(c => ({ label: c.name, onSelect: () => ctx.on.moveTo(card, c.key, 'bottom') })),
  }
  if (!ctx.phone || !here) return [moveTo]
  const at = here.cards.findIndex(x => x.id === card.id)
  const up = here.cards[at - 1]
  const down = here.cards[at + 1]
  return [
    moveTo,
    { label: 'Move up', disabledReason: why ?? (up ? undefined : 'It is first in its column'), onSelect: () => up && ctx.on.moveTo(card, here.key, { afterTaskId: null, beforeTaskId: up.id }) },
    { label: 'Move down', disabledReason: why ?? (down ? undefined : 'It is last in its column'), onSelect: () => down && ctx.on.moveTo(card, here.key, { afterTaskId: down.id, beforeTaskId: null }) },
  ]
}

function sprintItem(card: ViewCardData, ctx: CardMenuContext): BoardMenuItem | null {
  if (card.type?.kind === 'EPIC' || !ctx.choices) return null
  const { current, upcoming } = ctx.choices.sprints
  const now = ctx.sprintOf(card)
  const series = [...(current ? [current] : []), ...upcoming]
  const name = series.find(s => s.id === now)?.name ?? (now ? 'A past sprint' : 'None')
  return {
    label: 'Sprint', value: ctx.phone ? name : undefined, disabledReason: !ctx.mayWork ? VIEWER_CANNOT : series.length === 0 ? 'This project has no sprints yet' : undefined,
    choices: [
      ...series.map(s => ({ label: s.name, checked: s.id === now, onSelect: () => ctx.on.setSprint(card, s.id) })),
      { label: 'No sprint', checked: now === null, onSelect: () => ctx.on.setSprint(card, null) },
    ],
  }
}

export function cardMenu(card: ViewCardData, ctx: CardMenuContext): BoardMenuItem[] {
  const run = runItem(card, ctx)
  const runs = card.executionState === 'RUNNING' ? { label: 'Open in Runs', onSelect: () => ctx.on.openInRuns(card) } : null
  const sprint = sprintItem(card, ctx)
  const items: (BoardMenuItem | null)[] = ctx.phone
    ? [run, { label: 'Open', onSelect: () => ctx.on.open(card) }, ...moveItems(card, ctx).map((m, i) => (i === 0 ? { ...m, separatorBefore: false } : m)), sprint]
    : [{ label: 'Open', onSelect: () => ctx.on.open(card) }, run, runs, ...moveItems(card, ctx), sprint]
  return items.filter((i): i is BoardMenuItem => !!i)
}
