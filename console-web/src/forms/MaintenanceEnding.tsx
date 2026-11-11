import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { doItLabel, Notice, ScheduleWhen, type WhenChoice } from '../components'

/** What the machine answered so far; a form that sends its work itself passes its own run in this shape. */
export type EndingRun =
  | { phase: 'idle' | 'working' | 'done' }
  | { phase: 'scheduled'; at: string }
  | { phase: 'refused'; message: string }

/**
 * How every kind of maintenance ends (board *Changes flow*, proposal): *When* — now or at a time, with what members
 * see — then the machine's answer, then the one button, whose words follow *When*: *Do it now*, or *Schedule for
 * <day time>*. `nowOnly` replaces *When* with the sentence saying why it cannot be scheduled.
 */
export function MaintenanceEnding({ idPrefix, machineName, when, onWhen, whenError, run, done, refusedTitle, nowHint, laterHint, nowOnly, danger = false }: {
  idPrefix: string
  machineName: string
  when: WhenChoice
  onWhen: (when: WhenChoice) => void
  whenError?: string
  run: EndingRun
  /** What work done now says, under its title. */
  done: { title: string; text: ReactNode; tone?: 'healthy' | 'warning' }
  refusedTitle: string
  nowHint?: string
  /** What *At a time…* means for members; the generic line when not given. */
  laterHint?: string
  nowOnly?: string
  danger?: boolean
}) {
  const working = run.phase === 'working'
  // Once done or scheduled, a second press would repeat the work; to do it again, the person opens the panel afresh.
  const sent = working || run.phase === 'done' || run.phase === 'scheduled'
  return (
    <>
      {nowOnly
        ? <p className="mb-3 text-small text-text-primary">{nowOnly}</p>
        : <ScheduleWhen value={when} onChange={onWhen} error={whenError} disabled={working} idPrefix={idPrefix} nowHint={nowHint} laterHint={laterHint} />}
      {/* The result shows in the machine's state and the Maintenance list; only a refusal, or a rollback, needs the person. */}
      {run.phase === 'done' && done.tone === 'warning' && <Notice title={done.title}>{done.text}</Notice>}
      {run.phase === 'refused' && <Notice title={refusedTitle}>{run.message}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={sent}>{working ? `Waiting for ${machineName} to answer…` : nowOnly ? 'Do it now' : doItLabel(when)}</Button>
      </div>
    </>
  )
}
