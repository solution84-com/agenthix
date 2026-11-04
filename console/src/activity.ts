/**
 * The record of what fleet admins did is hq's (spec §7): every action taken here goes to `activity.record`, and the
 * ones the spec has announced — adding and disconnecting a site, exports and erases — are sent with `announce`, so
 * hq tells every fleet admin and organisation admin; a grant or removal of the role hq records and announces itself.
 * A subject is words a person reads; it never carries a key, a code or a credential.
 */
import type { HostRequest } from '@agenthix/core'
import type { HqLink } from './hq/link'

export type ActivityAction =
  | 'signedIn' | 'signedOut'
  | 'site.addStarted' | 'site.added' | 'site.addRefused' | 'site.registered' | 'site.disconnected'
  | 'console.moveStarted' | 'console.handedOver'
  | 'site.moveStarted' | 'site.moveMachineJoined' | 'site.moveScheduled' | 'site.moved' | 'site.moveFailed'
  | 'hq.moveStarted' | 'hq.moveMachineJoined' | 'hq.moveScheduled' | 'hq.moved' | 'hq.moveFailed'
  | 'hq.machineMarked'
  /** A machine's *Notify the fleet admins if this machine stops answering* changed. */
  | 'machine.notifySet'
  /** Remote access on a machine Cloud runs (net/remoteAccess.ts), and an authenticator claimed at a sign-in through it. */
  | 'remoteAccess.on' | 'remoteAccess.off' | 'remoteAccess.ended' | 'remoteAccess.authenticatorClaimed'
  | `command.${string}`

/** Commands whose every use is announced (spec §4: every export and erase). */
const ANNOUNCED_COMMANDS = new Set(['backup.export', 'erase'])

export class Activity {
  constructor(private readonly link: HqLink) {}

  /** `byUserId` null: the machine admin of the console's machine. */
  async record(byUserId: string | null, action: ActivityAction, subject: string, announce: boolean): Promise<void> {
    try {
      await this.link.call('activity.record', { byUserId, action, subject, at: new Date().toISOString(), announce })
    } catch (err) {
      console.error(`[console] could not record "${action}" in hq:`, err instanceof Error ? err.message : err)
    }
  }

  /** A command, announced when it is one the spec has announced, or a `schedule` that carries one. */
  command(byUserId: string, op: string, subject: string, scheduledOp?: string): Promise<void> {
    const announce = ANNOUNCED_COMMANDS.has(op) || (scheduledOp !== undefined && ANNOUNCED_COMMANDS.has(scheduledOp))
    return this.record(byUserId, `command.${op}`, subject, announce)
  }
}

/** What a kind of maintenance is called when it is planned for later: each kind by its own name. */
const PLANNED_WORDS: Record<string, string> = {
  'capacity.set': 'change capacity', 'backup.restore': 'restore from a backup', move: 'move', erase: 'erase', suspend: 'suspend', resume: 'resume',
}

/**
 * A time as the record prints it: the instant, in ISO form, never the text it was typed as — `Date.parse` accepts text
 * of any length, and hq refuses a record whose subject is too long.
 */
export function timeInRecord(at: string): string {
  const ms = Date.parse(at)
  return Number.isNaN(ms) ? at.slice(0, 40) : new Date(ms).toISOString()
}

/** The subject of planned maintenance: the machine, what is planned and when ("office-server: upgrade to 0.3.0, at …"). */
export function plannedSubject(machine: string, request: Extract<HostRequest, { op: 'schedule' }>): string {
  const { change } = request
  const what = change.op === 'upgrade' ? `upgrade to ${change.version}` : PLANNED_WORDS[change.op] ?? change.op
  return `${machine}: ${what}, at ${timeInRecord(request.at)}`
}
