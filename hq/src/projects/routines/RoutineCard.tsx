import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Play } from 'lucide-react'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import type { RoutineSummary } from '../../shared/routineTypes'
import { RoutineMarks } from './RoutineMarks'
import { DeleteRoutineDialog, RoutineMenu, type RoutineMenuItem } from './RoutineMenu'
import { RoutineNeedsBar } from './RoutineNeedsBar'
import { RoutineSwitch } from './RoutineSwitch'
import { CARD_LABEL } from './routineStyles'
import {
  RUN_NOW_TITLE, averageCost, goingWords, nextWords, offWords, perRunWords, routineRing, runNowWhy, whoWords, type Me,
} from './routineWords'

/** What a card's controls do, and the words for a reader who may not change the routine. */
export type CardActs = {
  onToggle: (on: boolean) => void
  onRunNow: () => void
  onDelete: () => void
  busy: boolean
  /** Why a Viewer may not change it. */
  viewerWhy: string
}

/** Run now, greyed with why when it is off, has no agent, or its last run is still going. */
export function RunNowButton({ routine, acts }: { routine: RoutineSummary; acts: Pick<CardActs, 'onRunNow' | 'busy' | 'viewerWhy'> }) {
  const why = runNowWhy(routine, acts.viewerWhy)
  return (
    <Button
      variant="secondary" leadingIcon={<Play size={14} aria-hidden className="fill-current" />}
      disabled={!!why || acts.busy} title={why ?? RUN_NOW_TITLE} onClick={acts.onRunNow}
    >
      Run now
    </Button>
  )
}

/** "Failed the last 4 times · “why” · 7 finished · about $0.02 a run". */
export function GoingLine({ routine, cost }: { routine: Pick<RoutineSummary, 'lastRuns'>; cost: (id: string) => number | undefined }) {
  const g = goingWords(routine.lastRuns)
  const per = perRunWords(averageCost(routine.lastRuns, cost))
  return (
    <>
      {g.failing && <span className="font-medium text-danger">{g.failing}</span>}
      {g.reason && <> · “{g.reason}”</>}
      {g.failing ? (per ? ` · ${per}` : '') : [g.counts, per].filter(Boolean).join(' · ')}
    </>
  )
}

/**
 * A routine's card, the same in a project's Routines and the Routines place across projects (the Routines design keys
 * 3–9): its agent's avatar leading in a fixed column with the run ring, its name and on whose behalf, the switch, Run
 * now and ⋯; then what it does, when, and how it has been going; a run that waits for its person as the bar at its
 * foot. A switched-off routine is one dashed, muted band and a line. Where the list can be reordered (a project's own
 * Routines, keys 12, 13), the grip sits before the avatar's column on a wide screen, and ⋯ has Move up and Move down.
 */
export function RoutineCard({ routine: r, about, href, me, now, cost, acts, place, order }: {
  routine: RoutineSummary
  /** Its instructions, in a line or two. */
  about: string | null
  href: string
  me: Me
  now: Date
  cost: (routineRunId: string) => number | undefined
  acts: CardActs
  /** Across projects on a phone, where it lives. */
  place?: ReactNode
  /** While the list can be reordered: the drag handle, Move up and Move down, and whether it is being dragged. */
  order?: { grip: ReactNode; moves: RoutineMenuItem[]; lifted: boolean }
}) {
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()
  const agent = r.agent?.name ?? 'No agent'
  const changeWhy = r.canChange ? undefined : acts.viewerWhy
  const next = nextWords(r, now)
  const switchControl = <RoutineSwitch title={r.title} on={r.enabled} why={changeWhy} busy={acts.busy} onChange={acts.onToggle} />
  const menu = (
    <RoutineMenu title={r.title} items={[
      { label: 'Open', onSelect: () => navigate(href) },
      ...(order?.moves ?? []),
      { label: 'Delete…', danger: true, onSelect: () => setDeleting(true), disabledWhy: changeWhy },
    ]} />
  )
  return (
    <article
      aria-label={r.title}
      className={`rounded-xl border ${order?.lifted ? 'border-border-strong bg-card shadow-pop' : r.enabled ? 'border-border bg-card' : 'border-dashed border-border-strong bg-transparent'}`}
    >
      <div className={`grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-x-3 py-2 pl-4 pr-2 max-sm:pl-3 max-sm:pr-1 ${order ? 'lg:grid-cols-[20px_40px_minmax(0,1fr)_auto] lg:pl-1' : ''}`}>
        {order?.grip}
        <span className="flex w-10 justify-center">
          <RunAvatar name={agent} state={routineRing(r)}><AuthedAgentAvatar name={agent} size="md" /></RunAvatar>
        </span>
        <span className="flex min-w-0 flex-col">
          <Link to={href} className={`rounded truncate text-h3 font-medium hover:underline ${r.enabled ? 'text-text-primary' : 'text-text-secondary'} ${FOCUS_RING}`}>{r.title}</Link>
          <span className="truncate text-small text-text-muted">{whoWords(r, me)}</span>
          {place}
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-2 max-sm:hidden">
            {switchControl}
            <RunNowButton routine={r} acts={acts} />
          </span>
          {menu}
        </span>
      </div>

      {r.enabled ? (
        <div className={`grid gap-4 border-t border-border-subtle py-3 pl-[68px] pr-4 ${order ? 'lg:pl-[88px]' : ''} sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.4fr)] max-sm:gap-2 max-sm:pl-3 max-sm:pr-3`}>
          <div className="max-sm:hidden">
            <h4 className={CARD_LABEL}>What it does</h4>
            <p className="line-clamp-2 text-small text-text-secondary">{about || 'No instructions yet.'}</p>
          </div>
          <div>
            <h4 className={`${CARD_LABEL} max-sm:hidden`}>When</h4>
            <p className="text-small text-text-secondary max-sm:font-medium max-sm:text-text-primary">{r.scheduleWords ?? r.cron}</p>
            <p className={`text-small ${next.live ? 'font-medium text-text-primary' : 'text-text-muted'}`}>{next.text}</p>
          </div>
          <div>
            <h4 className={`${CARD_LABEL} max-sm:hidden`}>How it's going</h4>
            <p className="flex items-center gap-2"><RoutineMarks runs={r.lastRuns} /></p>
            <p className="text-small text-text-secondary"><GoingLine routine={r} cost={cost} /></p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:hidden">
            {switchControl}
            <RunNowButton routine={r} acts={acts} />
          </div>
        </div>
      ) : (
        <div className={`flex items-center justify-between gap-2 pb-2.5 pl-[68px] pr-4 text-small text-text-muted max-sm:pl-3 max-sm:pr-3 ${order ? 'lg:pl-[88px]' : ''}`}>
          <span className="min-w-0 truncate">{offWords(r)}</span>
          <span className="sm:hidden">{switchControl}</span>
        </div>
      )}

      <RoutineNeedsBar routine={r} me={me} now={now} />
      {deleting && <DeleteRoutineDialog title={r.title} onCancel={() => setDeleting(false)} onDelete={() => { setDeleting(false); acts.onDelete() }} />}
    </article>
  )
}
