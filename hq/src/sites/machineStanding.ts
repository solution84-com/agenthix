/**
 * How a machine in the fleet stands, and what fleet admins read about it (host-management spec §6, §10). Pure, so
 * each rule and each wording is tested on its own; `machineNotices.ts` raises and clears them.
 */
import { HOST_SILENT_AFTER_MS } from '@agenthix/core'
import { FLEET_MACHINE_NOTIFICATION_TYPES as T } from '../notifications/notificationKinds'
import type { PersistentNotice } from '../notifications/persistent'
import type { FleetHost } from '../fleet/hosts'
import { clockIn, dayIn } from './scheduled/noticeWords'

/** Past any restart, upgrade or switch of a host service (spec §10); the Fleet Console's card counts the same. */
export const NOT_HEARD_FROM_AFTER_MS = HOST_SILENT_AFTER_MS

const LABEL_MAX = 40

/** hq's live view of the host link: when a machine's link came up, or null while it is down. */
export type HostPresence = { onlineSince(hostId: string): Date | null }

export type MachineStanding =
  | { kind: 'left'; at: Date }
  | { kind: 'notHeardFrom'; since: Date }
  /** Connected, or away for less than the grace: an open notice stays as it is and none is raised. */
  | { kind: 'undecided' }
  | { kind: 'fine' }

/**
 * A machine is judged only once hq itself has listened for 10 minutes: right after hq starts, no machine has had the
 * time to connect again.
 */
export function machineStanding(host: FleetHost, online: boolean, now: Date, hqStartedAt: Date): MachineStanding {
  if (host.leftAt) return { kind: 'left', at: host.leftAt }
  if (online) return { kind: 'fine' }
  // Its fleet admins did not ask to be told, or its host service said it stops on purpose (the Fleet Console's word,
  // `host.silenceFacts`): no notice, and an open one is cleared. hq's own machine is always told about.
  if (!(host.hqMachine || host.notifyIfSilent) || host.stoppedAt) return { kind: 'fine' }
  const lastHeard = host.lastSeenAt ?? host.joinedAt
  const graceFrom = Math.max(lastHeard.getTime(), hqStartedAt.getTime())
  return now.getTime() - graceFrom >= NOT_HEARD_FROM_AFTER_MS ? { kind: 'notHeardFrom', since: lastHeard } : { kind: 'undecided' }
}

function label(name: string): string {
  return name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1)}…` : name
}

/** `21:40` today, `Sat 18 Oct at 21:40` before, in the reader's zone. */
function sinceIn(at: Date, now: Date, zone: string): string {
  return dayIn(at, zone) === dayIn(now, zone) ? clockIn(at, zone) : `${dayIn(at, zone)} at ${clockIn(at, zone)}`
}

/** `actionUrl`: HQ's page of the site the machine carries; HQ does not know where the Fleet Console is opened. */
export function leftNotice(host: FleetHost, actionUrl: string): PersistentNotice {
  return {
    type: T.left, subjectKey: host.hostId,
    title: `${label(host.machineName)} left the fleet`,
    body: 'Disconnected on the machine itself.',
    actionLabel: 'Remove it in the Fleet Console', actionUrl,
  }
}

export function notHeardFromNotice(host: FleetHost, since: Date, now: Date, zone: string, actionUrl: string): PersistentNotice {
  return {
    type: T.notHeardFrom, subjectKey: host.hostId,
    title: `Not heard from ${label(host.machineName)} since ${sinceIn(since, now, zone)}`,
    body: 'It may be switched off, disconnected on the machine, or unable to reach HQ.',
    actionLabel: 'Open in the Fleet Console', actionUrl,
  }
}
