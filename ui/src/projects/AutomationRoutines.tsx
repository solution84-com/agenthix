import { Plus } from 'lucide-react'
import { describeRule, type ScheduleRuleInput } from '../tasks/RoutineRuleFields'
import { RoutineSquares } from '../tasks/RoutineSquares'
import type { RoutineRoundState } from '../tasks/RoutineWords'
import { AutomationSwitch } from './AutomationSwitch'
import { AutomationViewHeader } from './AutomationViewHeader'
import { whenLabel } from './AutomationTypes'

/**
 * The Automation tool's Routines view (every screen reviewed spec §3): each
 * routine with its switch, schedule, who it runs for, next run and its last
 * rounds as squares; New routine; a routine opens here.
 */

export interface AutomationRoutineRow {
  id: string
  title: string
  rule: ScheduleRuleInput | null
  enabled: boolean
  /** Set when the system paused it; only a project admin turns it back on. */
  pausedReason: string | null
  nextRoundAt: string | null
  onBehalfOf: { username: string | null }
  canManage: boolean
  /** Its last rounds' states, oldest first, for its squares. */
  lastRounds?: RoutineRoundState[]
}

export interface AutomationRoutinesProps {
  routines: AutomationRoutineRow[] | undefined
  /** Whether the person may set one up (their role starts runs). */
  canCreate: boolean
  /** Whether the person may turn a routine on (their role starts runs). */
  canResume: boolean
  busyId?: string | null
  error?: string
  onToggle: (routineId: string, on: boolean) => void
  onOpen: (routineId: string) => void
  onNew: () => void
  onBack: () => void
  clock?: Date
}

function nextText(r: AutomationRoutineRow, clock: Date | undefined): { text: string; tone: string } {
  if (!r.enabled) return r.pausedReason
    ? { text: 'paused — needs a project admin', tone: 'text-warning' }
    : { text: 'paused', tone: 'text-text-muted' }
  return r.nextRoundAt ? { text: `next: ${whenLabel(r.nextRoundAt, clock)}`, tone: 'text-text-secondary' } : { text: 'on', tone: 'text-text-secondary' }
}

export function AutomationRoutines(props: AutomationRoutinesProps) {
  const { routines, clock } = props
  return (
    <div className="space-y-4">
      <AutomationViewHeader
        title="Routines"
        onBack={props.onBack}
        action={props.canCreate && (
          <button type="button" onClick={props.onNew} className="flex items-center gap-1 text-small font-medium text-accent hover:underline">
            <Plus size={13} aria-hidden /> New routine
          </button>
        )}
      />
      {props.error && <p className="text-small text-danger">{props.error}</p>}
      {!routines ? (
        <p className="text-small text-text-muted">Loading…</p>
      ) : routines.length === 0 ? (
        <p className="text-small text-text-muted">
          No routines yet. A routine keeps its next round — a task from its template — ready for its next time.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {routines.map(r => {
            const next = nextText(r, clock)
            const mayTurnOn = props.canResume && !r.pausedReason
            return (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 flex"><AutomationSwitch
                  label={`${r.title} on`}
                  on={r.enabled}
                  disabled={!r.canManage || props.busyId === r.id || (!r.enabled && !mayTurnOn)}
                  onChange={on => props.onToggle(r.id, on)}
                /></span>
                <button type="button" onClick={() => props.onOpen(r.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-body font-medium text-text-primary hover:underline">{r.title}</div>
                  <div className="truncate text-small text-text-muted">
                    {describeRule(r.rule)}{r.onBehalfOf.username ? ` · on behalf of ${r.onBehalfOf.username}` : ''}
                  </div>
                  {r.lastRounds && r.lastRounds.length > 0 && <div className="mt-1"><RoutineSquares states={r.lastRounds} small /></div>}
                </button>
                <span className={`shrink-0 text-small ${next.tone}`}>{next.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-small text-text-muted">A routine opens to see its next round and how its last ones went, and to change what it creates or when.</p>
    </div>
  )
}
