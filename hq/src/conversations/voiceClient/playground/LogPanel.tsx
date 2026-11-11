/** The side column's Log: one list, newest first, each entry with its badge and time of day, and its filter chips. */
import { useState } from 'react'
import { FilterTabs } from '@agenthix/ui'
import { LOG_FILTERS, logView, timeOfDay, type LogBadge, type LogEntry, type LogFilter } from './playgroundLog'
import { PaneBar } from './PaneBar'

// The tone only repeats the badge's word.
const BADGE: Record<LogBadge, string> = {
  YOU: 'bg-selected text-text-primary',
  AGENT: 'bg-surface-3 text-text-primary',
  DECISION: 'bg-chip text-text-primary',
  HUM: 'bg-success/15 text-success',
  WORD: 'bg-success/15 text-success',
  INVITE: 'bg-success/15 text-success',
  PHRASE: 'bg-success/15 text-success',
  CALL: 'bg-chip text-text-secondary',
  ERROR: 'bg-danger/15 text-danger',
  NOTICE: 'bg-warning/15 text-warning',
}

const SHOWN = 300

/** Scenarios makes no sounds, so its Log has no Sounds chip. */
export function LogPanel({ lists, sounds = true }: { lists: readonly (readonly LogEntry[])[]; sounds?: boolean }) {
  const [chosen, setFilter] = useState<LogFilter>('all')
  const filter = !sounds && chosen === 'sounds' ? 'all' : chosen
  const entries = logView(lists, filter)
  return (
    <>
      <PaneBar title="Log"><span className="text-micro text-text-muted">{entries.length > SHOWN ? `Showing the newest ${SHOWN}` : 'newest first'}</span></PaneBar>
      <FilterTabs label="Show in the log" tabs={sounds ? LOG_FILTERS : LOG_FILTERS.filter(f => f.value !== 'sounds')} value={filter} onChange={setFilter} className="border-b border-border-subtle px-3 py-1.5" />
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-3" data-testid="playground-log">
        {entries.length === 0 && <li className="text-small text-text-muted">Nothing yet. Decisions, sounds, calls and errors show here as they happen.</li>}
        {entries.slice(0, SHOWN).map(e => (
          <li key={e.id} data-badge={e.badge} className="rounded-md border border-border bg-card px-2 py-1 text-small">
            <span className={`mr-1.5 inline-block rounded px-1.5 align-[1px] text-micro font-medium tracking-wide ${BADGE[e.badge]}`}>{e.badge}</span>
            <span className="break-words text-text-primary">{e.title}</span>
            <small className="block text-micro text-text-muted">{timeOfDay(e.at)}{e.after && ` · ${e.after}`}</small>
          </li>
        ))}
      </ol>
    </>
  )
}
