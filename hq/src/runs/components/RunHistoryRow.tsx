import type { KeyboardEvent } from 'react'
import { RunAvatar, OverflowMenu, type OverflowItem } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { RunHistoryRow as Row } from '../historyTypes'
import { KIND_TAG, phoneLine, rowCost, runRef, tookText } from './historyWords'

/** The columns of a wide list: run, what, agent, took, cost, started by, ⋯ (the Runs design). */
export const HISTORY_COLUMNS = 'lg:[grid-template-columns:112px_minmax(0,1fr)_150px_64px_64px_128px_36px]'

const NOTE_TONE = { danger: 'text-danger', warning: 'text-warning', muted: '' } as const

function Note({ note }: { note: NonNullable<Row['note']> }) {
  return (
    <span className="block truncate text-micro text-text-muted">
      {note.lead && <span className={NOTE_TONE[note.tone]}>{note.lead}</span>}
      {note.lead && note.text && ' · '}
      {note.text}
    </span>
  )
}

function Avatar({ row }: { row: Row }) {
  if (!row.agent) return null
  return (
    <RunAvatar name={row.agent.name} state={row.ring} size="sm">
      <AuthedAgentAvatar name={row.agent.name} avatarUrl={row.agent.avatarUrl} size="sm" />
    </RunAvatar>
  )
}

/**
 * One run in the history: its key and number, what it was (with a failure's reason, a stop, or what it asks), its
 * agent ringed with its state, how long it took, what it cost, who started it, and ⋯. The row opens the run; on a phone
 * it is the avatar and two lines.
 */
export function RunHistoryRow({ row, withPlace, actions, onOpen }: {
  row: Row
  /** The organisation's Runs: each row names its project. */
  withPlace: boolean
  actions: OverflowItem[]
  onOpen?: () => void
}) {
  const open = onOpen
    ? { role: 'link' as const, tabIndex: 0, onClick: onOpen, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter') onOpen() } }
    : {}
  const label = `${row.title}${row.number ? `, run ${row.number}` : ''}`
  return (
    <li className="border-b border-border-subtle" data-run={row.runId}>
      <div
        {...open} aria-label={onOpen ? `Open ${label}` : undefined}
        className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2 py-2.5 lg:grid ${HISTORY_COLUMNS} ${
          onOpen ? 'cursor-pointer hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent' : ''}`}
      >
        <span className="font-mono text-micro text-text-muted max-lg:hidden whitespace-nowrap">{runRef(row)}</span>
        <span className="lg:hidden"><Avatar row={row} /></span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <b className="truncate font-medium text-text-primary">{row.title}</b>
            <span className="shrink-0 rounded-full bg-chip px-2 text-micro leading-[18px] text-text-secondary max-lg:hidden">{KIND_TAG[row.kind]}</span>
            {withPlace && <span className="shrink-0 truncate text-micro text-text-secondary max-lg:hidden">{row.place.name}</span>}
          </div>
          <span className="lg:hidden block truncate text-micro text-text-muted">{phoneLine(row, { withPlace })}</span>
          {row.note && <span className="max-lg:hidden"><Note note={row.note} /></span>}
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-small max-lg:hidden">
          <Avatar row={row} /><span className="truncate">{row.agent?.name ?? 'No agent'}</span>
        </span>
        <span className="text-small tabular-nums text-text-secondary max-lg:hidden">{tookText(row.tookMs)}</span>
        <span className="text-small tabular-nums text-text-secondary max-lg:hidden">{rowCost(row.cost)}</span>
        <span className="truncate text-small text-text-secondary max-lg:hidden">{row.startedBy}</span>
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <OverflowMenu items={actions} label={`More for ${label}`} />
        </span>
      </div>
    </li>
  )
}
