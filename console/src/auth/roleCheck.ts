/**
 * A session lasts only while its person holds the fleet admin role: when hq stops listing them, every session of
 * theirs ends ("They are signed out here at once", the boards). hq is asked at most once a minute. When hq does not
 * answer, the last answer stands; nothing a session asks can reach a machine without hq anyway.
 */
import { parseFleetAdminAccounts, type FleetAdminAccount } from '@agenthix/core'
import type { HqLink } from '../hq/link'
import type { Session, Sessions } from './sessions'

const RECHECK_MS = 60_000

export class RoleCheck {
  private list: { admins: FleetAdminAccount[]; at: number } | null = null
  private inFlight: Promise<FleetAdminAccount[] | null> | null = null

  constructor(
    private readonly link: HqLink,
    private readonly sessions: Sessions,
    private readonly now: () => number = Date.now,
  ) {
    // hq says so as the role goes; the check above is for a word that did not arrive.
    link.on('fleetAdminRemoved', userId => {
      if (typeof userId !== 'string') return
      this.sessions.endAllOf(userId)
      this.forget()
    })
  }

  /** False when hq says the person no longer holds the role; their sessions have then ended. */
  async stillHolds(session: Session): Promise<boolean> {
    if (this.now() - session.roleCheckedAt < RECHECK_MS) return true
    const admins = await this.admins()
    if (!admins) return true
    if (!admins.some(a => a.id === session.user.id)) {
      this.sessions.endAllOf(session.user.id)
      return false
    }
    session.roleCheckedAt = this.now()
    return true
  }

  /** hq's list of fleet admins, fresh within the minute; null when hq does not answer. */
  async admins(): Promise<FleetAdminAccount[] | null> {
    if (this.list && this.now() - this.list.at < RECHECK_MS) return this.list.admins
    if (this.link.state !== 'connected') return null
    this.inFlight ??= this.link.call('fleetAdmin.list', {})
      .then(({ admins }) => {
        const valid = parseFleetAdminAccounts(admins)
        this.list = { admins: valid, at: this.now() }
        return valid
      })
      .catch(() => null)
      .finally(() => { this.inFlight = null })
    return this.inFlight
  }

  /** After a grant, the next check asks hq again. */
  forget(): void {
    this.list = null
  }
}
