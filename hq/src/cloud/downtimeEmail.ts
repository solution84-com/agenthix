/**
 * The email the day before a scheduled change (pre-release spec C3). The notice inside hq and the pausing of runs are
 * host management's; this adds only asking Cloud, through the connection, to email the members the change affects.
 * hq keeps no email service and sends nothing itself. Not connected: nothing is asked, and nothing is read for it.
 *
 * Cloud can email only Agenthix accounts, so the notice names the linked accounts of the affected members who are
 * still here; with none, nothing is sent. A new time is sent again under the same id, which replaces the last; a
 * change called off withdraws it.
 */
import { SCHEDULED_CHANGE_KINDS, type CloudDowntimeNotice } from '@agenthix/core'
import type { CloudConnection } from './cloudConnection'

export type DowntimeChange = {
  id: string
  kind: string
  at: Date
  expectedMinutes: number | null
  siteId: string | null
  /** The update the newest notice carried (core's ScheduledChangeUpdate). */
  lastUpdate: string
}

export type DowntimeEmailDeps = {
  connection: () => Pick<CloudConnection, 'clientId' | 'sendDowntimeNotice'> | null
  /** The linked Agenthix accounts of the active members a change on `siteId` (null: hq itself) affects. */
  linkedAccountsAffected: (siteId: string | null) => Promise<string[]>
}

/** A booking or a new time asks for the email, a change called off withdraws it; every other update asks nothing. */
function askOf(update: string): 'send' | 'withdraw' | null {
  if (update === 'scheduled' || update === 'changed') return 'send'
  return update === 'cancelled' ? 'withdraw' : null
}

/** What hq asks of Cloud for this update of a change; null when it asks nothing, or for a kind Cloud has no email for. */
export function downtimeNoticeFor(change: DowntimeChange, recipients: string[]): CloudDowntimeNotice | null {
  const ask = askOf(change.lastUpdate)
  const withdrawn = ask === 'withdraw'
  const kind = SCHEDULED_CHANGE_KINDS.find(k => k === change.kind)
  if (!ask || !kind || (!withdrawn && recipients.length === 0)) return null
  return {
    notice_id: change.id,
    kind,
    at: change.at.toISOString(),
    expected_minutes: change.expectedMinutes,
    affects: change.siteId ? 'site' : 'hq',
    recipients: withdrawn ? [] : recipients,
    withdrawn,
  }
}

/** True when Cloud was asked. */
export async function askCloudToEmail(change: DowntimeChange, deps: DowntimeEmailDeps): Promise<boolean> {
  const connection = deps.connection()
  if (!connection || !(await connection.clientId())) return false
  const ask = askOf(change.lastUpdate)
  if (!ask) return false
  const notice = downtimeNoticeFor(change, ask === 'withdraw' ? [] : await deps.linkedAccountsAffected(change.siteId))
  if (!notice) return false
  return (await connection.sendDowntimeNotice(notice)) === 'sent'
}
