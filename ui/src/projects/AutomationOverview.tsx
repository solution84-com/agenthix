import type { ReactNode } from 'react'
import { Pause, Play, Repeat, Settings2 } from 'lucide-react'
import { AUTOMATION_BUTTON, AutomationHeading } from './AutomationViewHeader'
import { whenLabel, type AutomationLaterItem, type AutomationStuckItem } from './AutomationTypes'

/**
 * The Automation tool's first view (every screen reviewed spec §3): its status
 * with Pause or Resume; Now — what is running, what is in line, and anything
 * stuck named with its fix; the Routines and Rules buttons; and Later — what
 * will start, in time order. No switches here.
 */

export type AutomationState = 'running' | 'paused' | 'orgOff'

export interface AutomationNow {
  running: Array<{ taskId: string; key: string }>
  inLine: number
  /** Only where the throttle holds work: a round in progress, or when the next may start. */
  round: { open: true } | { open: false; nextAt: string | null } | null
  stuck: AutomationStuckItem[]
}

export interface AutomationOverviewProps {
  state: AutomationState
  /** Why the person cannot pause or resume; absent when they can. */
  toggleRefusal?: string
  busy?: boolean
  /** Why the last Pause or Resume failed. */
  toggleError?: string
  onToggle: () => void
  now: AutomationNow
  routineCount: number
  later: AutomationLaterItem[]
  laterMore: number
  renderTaskLink: (taskId: string, children: ReactNode) => ReactNode
  onFix: (item: AutomationStuckItem) => void
  onOpenRoutine: (routineId: string) => void
  onOpenRuns: () => void
  onOpenRoutines: () => void
  onOpenRules: () => void
  /** For tests: the moment "Today" and "Tomorrow" are counted from. */
  clock?: Date
}

const STATUS_TEXT: Record<AutomationState, { label: string; hint: string }> = {
  running: { label: 'Running', hint: 'Queued tasks start on their own.' },
  paused: { label: 'Paused', hint: 'Nothing new starts on its own. Running work carries on.' },
  orgOff: { label: 'Paused', hint: 'Automation is off for the whole organisation. An org admin turns it back on.' },
}

const RUNNING_SHOWN = 3

function stuckText(item: AutomationStuckItem): { subject: string; problem: string; fix: string } {
  switch (item.kind) {
    case 'noAgent': return { subject: `${item.key} couldn't queue`, problem: 'no agent assigned', fix: 'Assign' }
    case 'lostAccess': return { subject: `${item.key} is blocked`, problem: 'its person lost access', fix: 'Choose someone' }
    case 'routinePaused': return { subject: `${item.title} paused`, problem: item.reason, fix: 'Open' }
  }
}

function roundText(round: AutomationNow['round'], clock: Date | undefined): string | null {
  if (!round) return null
  if (round.open) return 'round in progress'
  return round.nextAt ? `next round ${whenLabel(round.nextAt, clock)}` : null
}

export function AutomationOverview(props: AutomationOverviewProps) {
  const { state, now, clock } = props
  const status = STATUS_TEXT[state]
  const running = state === 'running'
  const shown = now.running.slice(0, RUNNING_SHOWN)
  const round = roundText(now.round, clock)

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-h3 font-semibold text-text-primary">
            <span aria-hidden className={`h-2 w-2 rounded-full ${running ? 'bg-success' : 'bg-text-muted'}`} />
            {status.label}
          </span>
          <button
            type="button"
            className={AUTOMATION_BUTTON}
            disabled={!!props.toggleRefusal || props.busy || state === 'orgOff'}
            title={props.toggleRefusal}
            onClick={props.onToggle}
          >
            {running ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
            {running ? 'Pause' : 'Resume'}
          </button>
        </div>
        <p className="text-small text-text-secondary">{status.hint}</p>
        {props.toggleRefusal && <p className="text-small text-text-muted">{props.toggleRefusal}</p>}
        {props.toggleError && <p className="text-small text-danger">{props.toggleError}</p>}
      </div>

      <section>
        <AutomationHeading>Now</AutomationHeading>
        <ul className="space-y-1.5 text-body text-text-primary">
          {now.running.length > 0 && (
            <li>
              <span aria-hidden className="text-success">● </span>
              <span className="font-medium">{now.running.length} running</span>
              <span className="text-text-muted">
                {' — '}
                {shown.map((t, i) => <span key={t.taskId}>{i > 0 && ', '}{props.renderTaskLink(t.taskId, t.key)}</span>)}
                {now.running.length > shown.length && `, +${now.running.length - shown.length}`}
              </span>
            </li>
          )}
          {now.inLine > 0 && (
            <li>
              <span aria-hidden className="text-text-muted">○ </span>
              <span className="font-medium">{now.inLine} in line</span>
              {round && <span className="text-text-muted"> — {round}</span>}
            </li>
          )}
          {now.running.length === 0 && now.inLine === 0 && <li className="text-text-muted">Nothing running or in line.</li>}
          {now.stuck.map(item => {
            const text = stuckText(item)
            return (
              <li key={item.kind === 'routinePaused' ? item.routineId : item.taskId}>
                <span aria-hidden className="font-semibold text-warning">! </span>
                <span className="font-medium">{text.subject}</span>
                <span className="text-text-muted"> — {text.problem} · </span>
                <button type="button" className="text-accent hover:underline" onClick={() => props.onFix(item)}>{text.fix}</button>
              </li>
            )
          })}
        </ul>
        <button type="button" className="mt-2 text-small text-accent hover:underline" onClick={props.onOpenRuns}>
          See them in Runs →
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={AUTOMATION_BUTTON} onClick={props.onOpenRoutines}>
          <Repeat size={13} aria-hidden /> Routines
          <span className="rounded-full bg-surface-2 px-1.5 text-micro text-text-secondary">{props.routineCount}</span>
        </button>
        <button type="button" className={AUTOMATION_BUTTON} onClick={props.onOpenRules}>
          <Settings2 size={13} aria-hidden /> Rules
        </button>
      </div>

      <section>
        <AutomationHeading>Later</AutomationHeading>
        {props.later.length === 0 ? (
          <p className="text-small text-text-muted">Nothing is set to start.</p>
        ) : (
          <ul className="space-y-2" data-testid="automation-later">
            {props.later.map(item => (
              <li key={`${item.kind}:${item.kind === 'routine' ? item.routineId : item.taskId}`} className="grid grid-cols-[7.5rem_1fr] gap-3">
                <span className="text-small text-text-secondary">{whenLabel(item.at, clock)}</span>
                <div className="min-w-0">
                  <div className="truncate text-body font-medium text-text-primary">
                    {item.kind === 'task'
                      ? props.renderTaskLink(item.taskId, `${item.key} ${item.title}`)
                      : <button type="button" className="hover:underline" onClick={() => props.onOpenRoutine(item.routineId)}>{item.title}</button>}
                  </div>
                  <div className="text-small text-text-muted">{item.kind === 'task' ? 'start time set on the task' : 'from a routine'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {props.laterMore > 0 && <p className="mt-2 text-small text-text-muted">and {props.laterMore} more</p>}
      </section>
    </div>
  )
}
