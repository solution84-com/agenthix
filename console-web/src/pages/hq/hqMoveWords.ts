/**
 * *Move HQ…* to a new machine, in five steps (board *Moving hq*, spec §13): the same states and machine reports as a
 * site's move (`reached`), in HQ's words. A step moves on only on what the two machines said.
 */
import { reached, type Move, type MoveProgress, type MoveStep } from '../site/move/moveWords'
import { whenIs } from '../dashboard/words'

/**
 * `newAddress`: where HQ answers on the new machine, or null when it keeps its own domain. `consoleCame`: where the
 * Fleet Console is opened, when it ran on HQ's old machine and was restored with HQ; null when it stays put.
 */
export function hqMoveProgress(m: Move, names: { from: string; to: string | null }, newAddress: string | null, consoleCame: string | null, now: Date): MoveProgress {
  const to = names.to ?? 'the new machine'
  const at = reached(m)
  const failed = m.state === 'failed'
  const confirmed = m.confirmedBy ? ` · fingerprint confirmed by ${m.confirmedBy.name}` : ''
  const details: (string | null)[] = [
    m.to ? `Waiting to receive HQ; it starts none of its own${confirmed}.` : 'Waiting for the new machine to connect with the code.',
    m.state === 'scheduled' && m.at ? `Scheduled for ${whenIs(m.at, now)}. Members see a notice from now; runs pause a few minutes before.`
      : m.state === 'arranging' ? 'Setting the two machines up for the move.'
      : 'HQ is read-only from the moment the backup starts, so nothing is lost between the backup and the switch.',
    "Passed straight from one host service to the other, sealed; its database holds every site's credential.",
    newAddress
      ? `Connected sites and host services are told ${newAddress} over the connection each already has; each switches once the new HQ proves it is the same one.`
      : 'Its domain is pointed at the new machine; sites and host services reconnect to the same address.',
    "The move's last step, once the new HQ has taken over. Not an erase: nothing is kept for 30 days and nobody is told of an erase.",
  ]
  const labels = [
    `${names.to ?? 'The new machine'} connected and waiting`,
    'Runs paused; sealed backup taken',
    `Restored on ${to}`,
    `HQ answers from ${to}`,
    `The old copy on ${names.from} is removed; that machine leaves the fleet`,
  ]
  const steps: MoveStep[] = labels.map((label, i) => ({
    label, detail: details[i],
    state: i < at ? 'done' : i === at ? (failed ? 'failed' : m.state === 'cancelled' ? 'todo' : 'current') : 'todo',
  }))

  let ended: MoveProgress['ended'] = null
  if (m.state === 'done') {
    const fleetConsole = consoleCame ? ` The Fleet Console came with it: open it at ${consoleCame} on ${to}.` : ''
    ended = { tone: 'healthy', title: 'Moved.', text: `HQ now runs on ${to}, and ${names.from} has left the fleet.${fleetConsole}` }
  } else if (failed) {
    ended = { tone: 'danger', title: 'The move did not complete.', text: m.problem ?? `HQ stays on ${names.from}.` }
  } else if (m.state === 'cancelled') {
    ended = { tone: 'neutral', title: 'Cancelled.', text: `HQ stays on ${names.from}.` }
  }

  return {
    title: `Moving HQ to ${names.to ?? 'a new machine'}`,
    stepOf: ended ? null : `Step ${Math.min(at, 4) + 1} of 5`,
    steps,
    ended,
    canCancel: m.state === 'waitingForMachine' || m.state === 'scheduled',
    canFinish: m.state === 'finishing' && m.problem !== null,
    problem: ended ? null : m.problem,
  }
}
