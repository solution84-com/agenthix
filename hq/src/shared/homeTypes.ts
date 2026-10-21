/** What Home reads from the server (every screen reviewed spec §8), shared by the queries and the page. */

/** Declared in core's client protocol, since the mobile app reads it too. */
export type { HomeSignals } from '@agenthix/core'

/** The pledge card on Home, as the server answers it (home/pledge.ts). */
export type PledgeCardView =
  | { kind: 'none' }
  | { kind: 'invite'; pageUrl: string }
  | { kind: 'inviteLinked'; pageUrl: string; signUrl: string }
  | { kind: 'newVersion'; signedVersion: number; currentVersion: number; signUrl: string }

/** The person's own signature of the pledge, for Settings; null without one hq knows of. */
export type MyPledge = { version: number; currentVersion: number; badgeUrl: string } | null
