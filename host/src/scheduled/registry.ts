/**
 * What can be scheduled (host-management spec §14): each change of the closed set plugs in here with what it
 * affects, how it reads, and how it runs. A change not registered yet is refused when someone schedules it, in
 * words, never held to fail at its time.
 *
 * Resize (`capacity.set`) is the first. Upgrade, restore, move, erase, suspend and resume plug in as they are built.
 *
 * A change's `run` either completes or leaves the machine as it was and throws why: that is the rollback the
 * spec asks for, and the scheduler reports it as one. One that needs the machine to itself waits for a running backup
 * first (`exclusiveWhenFree`), up to its bound, rather than failing because the machine is busy.
 */
import type { ChangeRequest, HostTarget, ScheduledChangeKind } from '@agenthix/core'
import type { Context } from '../service/context'
import { capacityProblem, machineSize, memoryText, setCapacity } from '../figures/capacity'
import { machineCeilings } from '../figures/figures'
import { Refusal } from '../owner/results'
import type { OnWait } from '../backups/take'

export type ScheduledRunner<R extends ChangeRequest = ChangeRequest> = {
  kind: ScheduledChangeKind
  /** What it changes: hq (with its default site), or the machine's site. */
  target: (request: R) => HostTarget
  /** The words after the change's name — a version, a size; null when there are none. */
  detail: (ctx: Context, request: R) => string | null
  /** About how long it takes, for the notice members read. */
  expectedMinutes: number
  /** Refuses, in words, a change that could not run as asked; run when it is scheduled and again at its time. */
  check: (ctx: Context, request: R) => void
  /**
   * Whether it needs the machine to itself, as a backup does (`exclusive`): then it waits for a backup or change that
   * holds the machine, such as the nightly backup, and says so through `waiting`.
   */
  holdsMachine?: boolean
  run: (ctx: Context, request: R, waiting: OnWait) => Promise<void>
}

type Runners = { [O in ChangeRequest['op']]?: ScheduledRunner<Extract<ChangeRequest, { op: O }>> }

function resizeDetail(ctx: Context, r: Extract<ChangeRequest, { op: 'capacity.set' }>): string | null {
  const c = r.ceilings
  const before = machineCeilings(ctx)
  const parts: string[] = []
  if (c.memoryBytesPerContainer !== before.memoryBytesPerContainer) parts.push(memoryText(c.memoryBytesPerContainer))
  if (c.cpusPerContainer !== before.cpusPerContainer) parts.push(`${c.cpusPerContainer} processors`)
  if (c.processesPerContainer !== before.processesPerContainer) parts.push(`${c.processesPerContainer} processes`)
  if (c.containersAtOnce !== before.containersAtOnce) parts.push(`${c.containersAtOnce} at once`)
  return parts.length ? parts.join(', ') : null
}

const runners: Runners = {
  'capacity.set': {
    kind: 'resize',
    target: () => 'site',
    detail: resizeDetail,
    expectedMinutes: 1,
    check: (ctx, r) => {
      const problem = capacityProblem(r.ceilings, machineCeilings(ctx), machineSize())
      if (problem) throw new Refusal('conflict', problem.replace(/^Not changed: /, 'Not scheduled: '))
    },
    run: async (ctx, r) => {
      setCapacity(ctx, r.ceilings)
    },
  },
}

/** The runner for a change, or null when this version cannot schedule it yet. */
export function runnerFor<R extends ChangeRequest>(request: R): ScheduledRunner<R> | null {
  return (runners[request.op] as ScheduledRunner<R> | undefined) ?? null
}

/**
 * Plugs a change in. Each later lane registers its own op once, from its own module; registering an op twice is
 * a mistake in the code, never something to work around.
 */
export function registerScheduledChange<O extends ChangeRequest['op']>(op: O, runner: ScheduledRunner<Extract<ChangeRequest, { op: O }>>): void {
  if (runners[op]) throw new Error(`A scheduled change for ${op} is already registered.`)
  ;(runners as Record<string, unknown>)[op] = runner
}
