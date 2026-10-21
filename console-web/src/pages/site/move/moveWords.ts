/**
 * A site's move, in the five steps of the board *Moving a site* (spec §13 *A site moves*). Each step moves on only on
 * what the Fleet Console says the two machines said (`reports`), and the move ends only on its own state.
 */
import type { PillTone } from '@agenthix/ui/primitives'
import { whenIs } from '../../dashboard/words'
import type { StepState } from '../../add/joinWords'

type HostMoveState = 'started' | 'transferring' | 'restoring' | 'tookOver' | 'committed' | 'rolledBack' | 'failed' | 'removed'

/** What `GET /api/moves/:moveId` answers (console/src/move/moves.ts). */
export type Move = {
  moveId: string
  kind?: 'hq'
  /** *Move HQ…*: the address HQ answers at on the new machine; null or absent, it keeps its own. */
  hqAddress?: string | null
  from: string
  siteName: string
  executionSiteId: string | null
  joinId: string | null
  to: string | null
  transferId: string | null
  at: string | null
  by: { userId: string; name: string } | null
  confirmedBy: { userId: string; name: string } | null
  changeId: string | null
  state: 'waitingForMachine' | 'arranging' | 'scheduled' | 'running' | 'finishing' | 'done' | 'failed' | 'cancelled'
  reports: { from: HostMoveState | null; to: HostMoveState | null }
  problem: string | null
  createdAt: string
}

export type MoveStep = { label: string; detail: string | null; state: StepState }

export type MoveProgress = {
  title: string
  /** "Step 4 of 5" while it goes; null once it ended. */
  stepOf: string | null
  steps: MoveStep[]
  ended: { tone: PillTone; title: string; text: string } | null
  canCancel: boolean
  /** The site runs on the new machine, and removing the old copy stalled: it can be carried on. */
  canFinish: boolean
  problem: string | null
}

/** How far the machines' own words take it: the step under way, 0 to 4, or 5 when every step is done. */
export function reached(m: Move): number {
  if (m.state === 'done') return 5
  if (m.state === 'finishing' || m.reports.to === 'tookOver') return 4
  if (m.reports.to === 'restoring' || m.reports.from === 'transferring') return 2
  if (m.to === null || m.state === 'waitingForMachine') return 0
  return 1
}

export function moveProgress(m: Move, names: { from: string; to: string | null }, now: Date): MoveProgress {
  const to = names.to ?? 'The new machine'
  const at = reached(m)
  const failed = m.state === 'failed'
  const confirmed = m.confirmedBy ? ` · fingerprint confirmed by ${m.confirmedBy.name}` : ''
  const when = m.at ? `Scheduled for ${whenIs(m.at, now)}.` : null
  const details: (string | null)[] = [
    m.to ? `Shown in the fleet as Waiting to receive ${m.siteName}${confirmed}.` : 'Waiting for the new machine to connect with the code.',
    m.state === 'scheduled' ? when : m.state === 'arranging' ? 'Setting the two machines up for the move.' : 'The site is read-only from the moment the backup starts; its runs pause.',
    'Passed straight from one host service to the other, sealed.',
    'With its own credential, as before; HQ sees the same site. Paused runs resume once it takes part.',
    `The move's last step, once the site answers from ${to}. Not an erase.`,
  ]
  const labels = [
    `${to} connected and waiting`,
    'Runs paused; sealed backup taken',
    `Restored on ${to}`,
    `The site dials HQ from ${to}`,
    `The old copy on ${names.from} is removed; that machine leaves the fleet`,
  ]
  const steps: MoveStep[] = labels.map((label, i) => ({
    label, detail: details[i],
    state: i < at ? 'done' : i === at ? (failed ? 'failed' : m.state === 'cancelled' ? 'todo' : 'current') : 'todo',
  }))

  let ended: MoveProgress['ended'] = null
  if (m.state === 'done') {
    // A site is named after its machine, so the move renames it (the owner's decision).
    const renamed = names.to ? `now runs on ${names.to}, and is named ${names.to}` : 'now runs on the new machine, and is named after it'
    ended = { tone: 'healthy', title: 'Moved.', text: `${m.siteName} ${renamed}. ${names.from} has left the fleet.` }
  } else if (failed) {
    ended = { tone: 'danger', title: 'The move did not complete.', text: m.problem ?? `${m.siteName} stays on ${names.from}.` }
  } else if (m.state === 'cancelled') {
    ended = { tone: 'neutral', title: 'Cancelled.', text: `${m.siteName} stays on ${names.from}.` }
  }

  return {
    title: `Moving ${m.siteName} to ${names.to ?? 'a new machine'}`,
    stepOf: ended ? null : `Step ${Math.min(at, 4) + 1} of 5`,
    steps,
    ended,
    canCancel: m.state === 'waitingForMachine' || m.state === 'scheduled',
    canFinish: m.state === 'finishing' && m.problem !== null,
    problem: ended ? null : m.problem,
  }
}
