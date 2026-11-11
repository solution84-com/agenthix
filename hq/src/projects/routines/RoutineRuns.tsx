import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Button, EmptyState, FOCUS_RING } from '@agenthix/ui/primitives'
import type { RoutineRunView } from '../../shared/routineTypes'
import { costText } from '../workroom/workroomWords'
import { RunMarkGlyph } from './RoutineMarks'
import { routineRunHref } from './routineAddresses'
import { LINK_BUTTON } from './routineStyles'
import { MARK_WORDS, runDidWords, runMark, runName, runWhen, tookWords, type Me } from './routineWords'

const TONE = { danger: 'text-danger', warning: 'text-warning', accent: 'text-text-primary', none: '' } as const
const TH = 'px-2 py-2 text-left text-micro font-medium uppercase tracking-wide text-text-muted first:pl-4 last:pr-4'
const TD = 'px-2 py-2 align-middle text-small first:pl-4 last:pr-4'

/**
 * A routine's runs (the Routines design key 5): every firing as one line, its mark and state in words, what it did,
 * how long and what it cost; a firing that came while the last run was going is listed as Skipped. A line opens the
 * run: its conversation for the person it ran for, its line in Runs for anyone else (ADR-0041: a chat is its person's).
 */
export function RoutineRuns({ runs, total, more, onMore, me, now, cost, allHref }: {
  runs: RoutineRunView[]
  /** How many are listed, or "N+" when there are more. */
  total: string
  more: boolean
  onMore: () => void
  me: Me
  now: Date
  cost: (id: string) => number | undefined
  allHref: string
}) {
  return (
    <section aria-label="Its runs" className="min-w-0 rounded-xl border border-border bg-card">
      <div className="flex min-h-[52px] items-center gap-2 border-b border-border-subtle py-2 pl-4 pr-2">
        <h3 className="text-h3 font-medium text-text-primary">Its runs</h3>
        <span className="text-small text-text-muted">{total}</span>
        <Link to={allHref} className={`${LINK_BUTTON} ml-auto h-9`}>All in Runs<ChevronRight size={14} aria-hidden /></Link>
      </div>
      {runs.length === 0 ? (
        <div className="p-4"><EmptyState variant="inline" title="No runs yet. Its first run is the first time its schedule reads back, or Run now." /></div>
      ) : (
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-border-subtle">
            <th className={`${TH} w-40`}>Run</th><th className={TH}>What it did</th>
            <th className={`${TH} text-right max-sm:hidden`}>Took</th><th className={`${TH} text-right`}>Cost</th>
          </tr></thead>
          <tbody>
            {runs.map(r => {
              const did = runDidWords(r, me)
              const href = routineRunHref(r, me.id)
              const skipped = r.state === 'SKIPPED'
              const c = cost(r.id)
              const name = href
                ? <Link to={href} className={`rounded font-medium text-text-primary hover:underline ${FOCUS_RING}`}>{runName(r)}</Link>
                : <span className={skipped ? 'text-text-muted' : 'font-medium text-text-primary'}>{runName(r)}</span>
              return (
                <tr key={r.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-hover">
                  <td className={TD}>
                    <div className="flex items-center gap-2"><RunMarkGlyph mark={runMark(r)} title={MARK_WORDS[runMark(r)]} />{name}</div>
                    <div className="pl-[18px] text-micro text-text-muted">{runWhen(new Date(r.dueAt ?? r.startedAt), now)}</div>
                  </td>
                  <td className={`${TD} ${skipped ? 'text-text-muted' : 'text-text-secondary'}`}>
                    <span className={`font-medium ${TONE[did.tone ?? 'none']}`}>{did.state}</span>
                    {did.rest && <span>{did.tone === 'danger' ? ': ' : ' · '}{did.rest}</span>}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right max-sm:hidden ${skipped ? 'text-text-muted' : ''}`}>{tookWords(r, now)}</td>
                  <td className={`${TD} whitespace-nowrap text-right ${skipped ? 'text-text-muted' : ''}`}>{skipped || c === undefined ? '—' : costText(c)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {more && <div className="border-t border-border-subtle p-2"><Button variant="secondary" onClick={onMore}>Older runs</Button></div>}
    </section>
  )
}
