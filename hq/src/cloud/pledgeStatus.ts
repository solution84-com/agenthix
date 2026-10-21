/**
 * Whether a person whose Agenthix account is linked has signed the Responsible AI Pledge (core/src/cloud/pledge.ts),
 * for the pledge card on Home and their own Settings. Asked of Cloud through the connection, only for someone with a
 * link, and kept for an hour so Home does not ask on every visit; an answer that failed is kept for five minutes.
 * Shown to that person alone.
 */
import type { CloudPledgeStatus } from '@agenthix/core'
import type { CloudConnection } from './cloudConnection'

export type PledgeStanding =
  /** No link, not connected, or Cloud did not answer: hq knows nothing of the person's pledge. */
  | { kind: 'unknown' }
  | { kind: 'notSigned'; withdrawn: boolean; currentVersion: number }
  | { kind: 'signed'; version: number; currentVersion: number; signerId: string }

export type PledgeStatusDeps = {
  connection: () => Pick<CloudConnection, 'pledgeStatus'> | null
  /** The `sub` of the person's linked Agenthix account; null without a link. */
  subjectOf: (userId: string) => Promise<string | null>
  now?: () => number
}

const KEPT_MS = 60 * 60_000
const FAILED_KEPT_MS = 5 * 60_000

function standingOf(status: CloudPledgeStatus | null): PledgeStanding {
  if (!status) return { kind: 'unknown' }
  if (!status.signature) return { kind: 'notSigned', withdrawn: status.withdrawn, currentVersion: status.current_version }
  return { kind: 'signed', version: status.signature.version, currentVersion: status.current_version, signerId: status.signature.signer_id }
}

export class PledgeStatuses {
  private readonly kept = new Map<string, { standing: PledgeStanding; until: number }>()
  private readonly now: () => number

  constructor(private readonly deps: PledgeStatusDeps) {
    this.now = deps.now ?? Date.now
  }

  async of(userId: string): Promise<PledgeStanding> {
    const connection = this.deps.connection()
    const subject = connection ? await this.deps.subjectOf(userId) : null
    if (!connection || !subject) return { kind: 'unknown' }
    // Keyed by the account too, so linking another account asks afresh.
    const key = `${userId}\n${subject}`
    const held = this.kept.get(key)
    if (held && held.until > this.now()) return held.standing
    let standing: PledgeStanding
    let keptFor = KEPT_MS
    try {
      standing = standingOf(await connection.pledgeStatus(subject))
    } catch {
      standing = { kind: 'unknown' }
      keptFor = FAILED_KEPT_MS
    }
    this.kept.set(key, { standing, until: this.now() + keptFor })
    return standing
  }
}
