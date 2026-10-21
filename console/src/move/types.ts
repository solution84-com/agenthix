/** What a move is, as the Fleet Console keeps it (moves.ts), and what the parts of a move share. */
import type { HostActor, MoveState as HostMoveState } from '@agenthix/core'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import type { HostCommands } from '../hosts/commands'
import type { Presence } from '../hosts/presence'
import type { Joins } from '../join/joins'
import type { StateFolder } from '../state/folder'
import type { PinnedHosts } from '../state/hosts'

export type FleetAdmin = HostActor & { kind: 'fleetAdmin' }

export type MoveState = 'waitingForMachine' | 'arranging' | 'scheduled' | 'running' | 'finishing' | 'done' | 'failed' | 'cancelled'

export type Move = {
  moveId: string
  /** *Move HQ…*: hq, its default site and a Fleet Console beside them; absent for *Move site…*. */
  kind?: 'hq'
  /** *Move HQ…*: the address hq answers at on the new machine; null, it keeps its own. */
  hqAddress?: string | null
  /** The machine the site is on now. */
  from: string
  siteName: string
  /** hq's site has none in the Fleet Console's record: hq's own machine carries it. */
  executionSiteId: string | null
  joinId: string | null
  /** When the new machine's code runs out (ISO). */
  codeExpiresAt?: string
  /** The machine that connected with the code; null until a fleet admin confirmed it. */
  to: string | null
  transferId: string | null
  /** When it runs (ISO); null: as soon as the new machine is confirmed. */
  at: string | null
  /** Who asked: a fleet admin, or null for the site's machine admin. */
  by: { userId: string; name: string } | null
  /** The fleet admin who confirmed the new machine: the commands go out in their name. */
  confirmedBy: { userId: string; name: string } | null
  changeId: string | null
  state: MoveState
  /** What each machine last said. */
  reports: { from: HostMoveState | null; to: HostMoveState | null }
  problem: string | null
  createdAt: string
}

export type Where = 'still' | 'again' | 'starting'

export class MoveError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message)
  }
}

export type MovesDeps = {
  link: HqLink
  hosts: PinnedHosts
  commands: HostCommands
  joins: Joins
  presence: Presence
  activity: Activity
  state: StateFolder
}

export const ACTIVE: MoveState[] = ['waitingForMachine', 'arranging', 'scheduled', 'running', 'finishing']
