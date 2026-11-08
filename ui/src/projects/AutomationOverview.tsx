import type { ReactNode } from 'react'
import { Repeat, Settings2 } from 'lucide-react'
import { AUTOMATION_BUTTON, AutomationHeading } from './AutomationViewHeader'
import { whenLabel, type AutomationLaterItem, type AutomationStuckItem } from './AutomationTypes'

/**
 * The Automation tool's first view (every screen reviewed spec §3): Now — what
 * is running, and anything stuck named with its fix; the Routines and Rules
 * buttons; and Later — what will start, in time order. Work starts only by an
 * explicit act (adr-0175), so there is no switch here: what is listed under
 * Later is what someone set to start.
 */

export interface AutomationNow {
  running: Array<{ taskId: string; key: string }>
  stuck: AutomationStuckItem[]
}

export interface AutomationOverviewProps {
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

const RUNNING_SHOWN = 3

function stuckText(item: AutomationStuckItem): { subject: string; problem: string; fix: string } {
  switch (item.kind) {
    case 'noAgent': return { subject: `${item.key} couldn't queue`, problem: 'no agent assigned', fix: 'Assign' }
    case 'lostAccess': return { subject: `${item.key} is blocked`, problem: 'its person lost access', fix: 'Choose someone' }
    case 'routinePaused': return { subject: `${item.title} paused`, problem: item.reason, fix: 'Open' }
  }
}

export function AutomationOverview(props: AutomationOverviewProps) {
  const { now, clock } = props
  const shown = now.running.slice(0, RUNNING_SHOWN)

  return (
    <div className="space-y-5">
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
          {now.running.length === 0 && <li className="text-text-muted">Nothing running.</li>}
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
