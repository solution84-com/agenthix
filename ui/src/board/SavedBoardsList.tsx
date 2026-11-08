import type { ReactNode } from 'react'
import { EmptyState } from '../primitives/EmptyState'
import { FOCUS_RING } from '../primitives/controlStyles'
import { BoardChip } from './BoardHeader'
import { BoardMenu, type BoardMenuItem } from './CardMenu'
import { SpreadBar } from './SpreadBar'
import { movedWords, needsYouWords } from './boardWords'
import type { BoardRowData } from './types'

/** How many of a board's tasks need the person, in words; the warning tone only repeats them. */
export function NeedsYouPill({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-warning/20 px-2 text-micro font-medium text-warning">
      {needsYouWords(count)}
    </span>
  )
}

/** A board's row: its name and facts, what it groups by, when a card last moved, its spread, and its ⋯. */
function BoardRow({ board, now, onOpen, menu }: { board: BoardRowData; now: Date; onOpen: () => void; menu: BoardMenuItem[] }) {
  const moved = board.kind === 'EXECUTION' ? null : movedWords(board.lastMovedAt, now)
  const when = (
    <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-small text-text-muted max-sm:hidden">
      {board.needsYouCount > 0 && <NeedsYouPill count={board.needsYouCount} />}
      {board.needsYouCount > 0 && moved && <span aria-hidden>·</span>}
      {moved}
    </span>
  )
  return (
    <li className="relative flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-1 py-3 pl-4 pr-3 hover:border-accent focus-within:border-accent [&+&]:mt-2">
      <button type="button" onClick={onOpen} aria-label={`Open ${board.name}`} className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded text-left ${FOCUS_RING}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-text-primary">{board.name}</span>
          {board.builtIn && <BoardChip>Built in</BoardChip>}
          {board.kind === 'EXECUTION' && <BoardChip outlined>Read-only</BoardChip>}
          <span className="truncate text-small text-text-muted max-sm:hidden">{board.what}</span>
          {board.needsYouCount > 0 && <span className="ml-auto sm:hidden"><NeedsYouPill count={board.needsYouCount} /></span>}
          {when}
        </span>
        <span className="truncate text-small text-text-muted sm:hidden">{[board.what, moved].filter(Boolean).join(' · ')}</span>
        <SpreadBar kind={board.kind} spread={board.spread} />
      </button>
      <BoardMenu heading={board.name} items={menu} label={`More for ${board.name}`} className="max-sm:[&_button]:h-11 max-sm:[&_button]:w-11" />
    </li>
  )
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section aria-label={heading} className="mt-4 [&+&]:border-t [&+&]:border-border-subtle [&+&]:pt-4">
      <h3 className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted">{heading}</h3>
      {children}
    </section>
  )
}

/**
 * A project's boards (BS1, the board design's Saved boards): the two built-in boards first, then every saved board,
 * each with its spread across its columns, how many need the person, and when a card on it last moved.
 */
export function SavedBoardsList({ boards, now, onOpen, menuFor }: {
  boards: BoardRowData[]
  now: Date
  onOpen: (board: BoardRowData) => void
  menuFor: (board: BoardRowData) => BoardMenuItem[]
}) {
  const builtIn = boards.filter(b => b.builtIn)
  const saved = boards.filter(b => !b.builtIn)
  const row = (b: BoardRowData) => <BoardRow key={b.key} board={b} now={now} onOpen={() => onOpen(b)} menu={menuFor(b)} />
  return (
    <div className="px-6 pb-6 max-sm:px-3">
      <Group heading="Built in"><ul>{builtIn.map(row)}</ul></Group>
      <Group heading="Saved">
        {saved.length === 0
          ? <EmptyState variant="inline" title="No saved boards yet. Group a board by a type's columns or a field, filter it to a sprint, an epic or an agent, and save it to find it here." />
          : <ul>{saved.map(row)}</ul>}
      </Group>
    </div>
  )
}
