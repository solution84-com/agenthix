import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { doItLabel, Notice, ScheduleWhen, type WhenChoice } from '../components'
import { Link } from '../router'

/** What the machine answered so far; a form that sends its work itself passes its own run in this shape. */
export type EndingRun =
  | { phase: 'idle' | 'working' | 'done' }
  | { phase: 'scheduled'; at: string }
  | { phase: 'refused'; message: string }

const at = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * How every kind of maintenance ends (board *Changes flow*, proposal): *When* — now or at a time, with what members
 * see — then the machine's answer, then the one button, whose words follow *When*: *Do it now*, or *Schedule for
 * <day time>*. `nowOnly` replaces *When* with the sentence saying why it cannot be scheduled.
 */
export function MaintenanceEnding({ idPrefix, machineName, when, onWhen, whenError, run, done, refusedTitle, nowHint, nowOnly, danger = false }: {
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
  nowOnly?: string
  danger?: boolean
}) {
  const working = run.phase === 'working'
  return (
    <>
      {nowOnly
        ? <p className="mb-3 text-small text-text-primary">{nowOnly}</p>
        : <ScheduleWhen value={when} onChange={onWhen} error={whenError} disabled={working} idPrefix={idPrefix} nowHint={nowHint} />}
      {working && <Notice>Waiting for {machineName} to answer…</Notice>}
      {run.phase === 'done' && <Notice tone={done.tone ?? 'healthy'} title={done.title}>{done.text}</Notice>}
      {run.phase === 'scheduled' && (
        <Notice tone="healthy" title="Scheduled.">
          {machineName}'s host service holds it and runs it at {at(run.at)}. HQ tells the members whose work is affected. <Link to="/maintenance" className="underline">See it under Maintenance</Link>.
        </Notice>
      )}
      {run.phase === 'refused' && <Notice tone="danger" title={refusedTitle}>{run.message}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={working}>{nowOnly ? 'Do it now' : doItLabel(when)}</Button>
      </div>
    </>
  )
}
