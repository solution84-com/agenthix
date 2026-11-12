/** What the owner socket's machine-only operations answer; the controller's operations answer core's `HostResult`. */
import type { HostRefusal, HostRefusalCode } from '@agenthix/core'
import type { MachineStatus } from '../status/machineStatus'
import type { FrontDoorCheck } from '../frontDoor/frontDoor'

export type InstallResult = {
  address: string
  listen: { bind: string; port: number }
  siteName: string
  siteConnected: boolean
  /** How many people HQ has; the link for the first account is made only when it has none. */
  users: number
  firstAccountLink: string | null
  /** Set for `install --demo`, whose HQ seeds its own sample organisation and gives no one a first account. */
  demo?: true
}

export type HqLinkResult = {
  /** For `invite-admin`: a first-account link, or an admin invitation once HQ has people. */
  kind: 'firstAccount' | 'invitation' | 'passwordReset'
  link: string
  validHours: number
  /** For a password reset: the person the link is for, as HQ names them. */
  person: { name: string; handle: string | null } | null
  /** The organisation admins HQ told, by name. */
  toldAdmins: string[]
}

export type MachineResults = {
  'machine.status': MachineStatus
  'machine.install': InstallResult
  'hq.inviteAdmin': HqLinkResult
  'hq.resetPassword': HqLinkResult
  'frontDoor.check': FrontDoorCheck
}

export type OwnerAnswer =
  | { ok: true; op: string; result: unknown }
  | { ok: false; op: string | null; refusal: HostRefusal }

/** Thrown inside an operation to refuse it with words a person reads. */
export class Refusal extends Error {
  constructor(readonly code: HostRefusalCode, message: string) {
    super(message)
    this.name = 'Refusal'
  }
}
