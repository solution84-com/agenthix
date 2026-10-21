import type { ReactNode } from 'react'
import { roundWhen, ruleSentence, zoneLabel } from './RoutineWords'
import type { ScheduleRuleInput } from './RoutineRuleFields'

const BUTTON = 'whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 py-1 text-small text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
const PRIMARY = 'whitespace-nowrap rounded-lg bg-accent px-3 py-1 text-small font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40'

/** A section's heading, with an action on its right (Edit, Older rounds…). */
export function RoutineSectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-1.5 mt-5 flex items-center justify-between text-micro font-medium uppercase tracking-wide text-text-muted">
      <span>{title}</span>
      {action}
    </div>
  )
}

/** "Edit", beside a section's heading. */
export function RoutineEditLink({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-small font-normal normal-case tracking-normal text-accent hover:underline">Edit</button>
}

export interface RoutineSentenceProps {
  rule: ScheduleRuleInput | null
  scheduleAt: string
  timezone: string
  agentName: string | null
  place: string
  onBehalfOf: string
  createdBy: string
}

/**
 * What happens, in one sentence (spec §3): "Every weekday at 9:00, a task for
 * Frontend dev in Release board › To do, on behalf of Avery." With no agent the
 * round waits for a person, and the sentence says so.
 */
export function RoutineSentence(p: RoutineSentenceProps) {
  const when = ruleSentence(p.rule, { at: p.scheduleAt, timezone: p.timezone })
  return (
    <div>
      <p className="text-body text-text-primary">
        <b className="font-semibold">{when}</b>, a task
        {p.agentName ? <> for <b className="font-semibold">{p.agentName}</b></> : null} in <b className="font-semibold">{p.place}</b>
        {p.agentName ? null : <>, waiting for a person to start it</>}, on behalf of <b className="font-semibold">{p.onBehalfOf}</b>.
      </p>
      <p className="mt-0.5 text-micro text-text-muted">{zoneLabel(p.timezone)} · set up by {p.createdBy}</p>
    </div>
  )
}

export interface RoutineNextRoundProps {
  at: string | null
  /** The waiting round's key and where it waits, when there is one. */
  round: { key: string; place: string } | null
  hasAgent: boolean
  busy?: boolean
  /** Absent when the viewer may not run or skip it. */
  onRunNow?: () => void
  onSkip?: () => void
  renderOpen?: (children: ReactNode) => ReactNode
  now?: Date
}

/** The next round (spec §3): its time and task, Run now, Open and Skip this time. */
export function RoutineNextRound({ at, round, hasAgent, busy, onRunNow, onSkip, renderOpen, now }: RoutineNextRoundProps) {
  const when = at ? roundWhen(at, now) : null
  return (
    <div className="rounded-xl border border-border bg-surface-1 px-3.5 py-3">
      <b className="text-body font-semibold text-text-primary">{when ?? 'Not scheduled'}</b>
      {round && <p className="text-small text-text-muted">{round.key} · waiting in {round.place}</p>}
      {round && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onRunNow && hasAgent && <button type="button" disabled={busy} onClick={onRunNow} className={PRIMARY}>Run now</button>}
          {renderOpen?.(<span className={`${BUTTON} inline-block`}>Open {round.key}</span>)}
          {onSkip && <button type="button" disabled={busy} onClick={onSkip} className={BUTTON}>Skip this time</button>}
        </div>
      )}
      {round && (
        <p className="mt-1.5 text-micro text-text-muted">
          {hasAgent
            ? `Run now starts this round straight away, so you can watch it; the next one is still ${when ?? 'at its time'}.`
            : 'It has no agent, so at its time it waits for a person to start it.'}
        </p>
      )}
    </div>
  )
}

/** Rows of facts: a label column and its values (What it creates, When). */
export function RoutineFacts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-small @md:grid-cols-[110px_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-medium text-text-muted">{label}</dt>
          <dd className="min-w-0 text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
