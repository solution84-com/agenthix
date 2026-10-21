/**
 * Authenticator codes for signing in through remote access on a machine Agenthix Cloud runs (pre-release spec B9).
 * Cloud hands each one over unclaimed, with the SHA-256 of its 10 recovery codes; the first fleet admin who signs in
 * through remote access without one of their own and gives a valid code from it claims it, and from then on it is
 * theirs alone. One left unclaimed past `claimBefore` is dropped.
 *
 * The TOTP secret has to be kept to check a code, so it is, in the state folder (readable by its owner only), and
 * never logged or sent anywhere. A recovery code is kept only as its hash, and works once. A code works once too:
 * the step it was made in is remembered, so the same six digits cannot be replayed within their 30 seconds.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { RemoteAuthenticatorRequest } from '@agenthix/core'
import type { StateFolder } from '../state/folder'
import { totpStep } from './totp'

const FILE = 'authenticators.json'
const MAX_KEPT = 100

type Stored = {
  id: string
  secret: string
  recoveryCodeHashes: string[]
  claimBefore: string
  addedAt: string
  claimedBy: string | null
  claimedAt: string | null
  /** The last TOTP step taken; a code from it or before is refused. */
  lastStep: number
}

/** `claimed`: a code from an unclaimed one, now bound to this person. `none`: nothing is set up that they could use. */
export type CodeCheck = 'ok' | 'claimed' | 'wrong' | 'none'

export type CodeInput = { code?: string; recoveryCode?: string }

/** A recovery code as Cloud hashed it: `xxxx-xxxx`, lowercase. */
export const recoveryCodeHash = (code: string) => createHash('sha256').update(code.trim().toLowerCase()).digest('hex')

export class Authenticators {
  private list: Stored[]

  constructor(private readonly state: StateFolder, private readonly now: () => number = Date.now) {
    const stored = state.readJson(FILE) as { authenticators?: unknown } | null
    this.list = Array.isArray(stored?.authenticators) ? stored.authenticators.filter(isStored) : []
  }

  /** Repeating the same one is answered as added; another with an id already used is not. */
  add(r: RemoteAuthenticatorRequest): { added: boolean } {
    this.prune()
    const same = this.list.find(a => a.id === r.id)
    if (same) return { added: same.claimedBy === null && same.secret === r.secret && same.recoveryCodeHashes.join() === r.recoveryCodeHashes.join() }
    if (this.list.length >= MAX_KEPT) return { added: false }
    this.list.push({
      id: r.id, secret: r.secret, recoveryCodeHashes: [...r.recoveryCodeHashes], claimBefore: r.claimBefore,
      addedAt: new Date(this.now()).toISOString(), claimedBy: null, claimedAt: null, lastStep: -1,
    })
    this.save()
    return { added: true }
  }

  /** Forgets the person's own authenticator and its recovery codes; they set one up again from an unclaimed one. */
  reset(userId: string): { reset: boolean } {
    const before = this.list.length
    this.list = this.list.filter(a => a.claimedBy !== userId)
    if (this.list.length === before) return { reset: false }
    this.save()
    return { reset: true }
  }

  hasOwn(userId: string): boolean {
    return this.list.some(a => a.claimedBy === userId)
  }

  /**
   * Checks the code a person gave, after hq checked their login. Their own authenticator takes a code or a recovery
   * code; with none of their own, only a code from an unclaimed one counts, and claims it.
   */
  check(userId: string, input: CodeInput): CodeCheck {
    this.prune()
    const now = this.now()
    const own = this.list.find(a => a.claimedBy === userId)
    if (own) {
      if (input.recoveryCode !== undefined) {
        const hash = recoveryCodeHash(input.recoveryCode)
        const i = own.recoveryCodeHashes.findIndex(h => safeEqual(h, hash))
        if (i < 0) return 'wrong'
        own.recoveryCodeHashes.splice(i, 1)
        this.save()
        return 'ok'
      }
      const step = input.code === undefined ? null : totpStep(own.secret, input.code, now)
      if (step === null || step <= own.lastStep) return 'wrong'
      own.lastStep = step
      this.save()
      return 'ok'
    }
    const unclaimed = this.list.filter(a => a.claimedBy === null)
    if (unclaimed.length === 0) return 'none'
    if (input.code === undefined) return 'wrong'
    for (const a of unclaimed) {
      const step = totpStep(a.secret, input.code, now)
      if (step === null) continue
      a.claimedBy = userId
      a.claimedAt = new Date(now).toISOString()
      a.lastStep = step
      this.save()
      return 'claimed'
    }
    return 'wrong'
  }

  private prune(): void {
    const now = this.now()
    const before = this.list.length
    this.list = this.list.filter(a => a.claimedBy !== null || Date.parse(a.claimBefore) > now)
    if (this.list.length !== before) this.save()
  }

  private save(): void {
    this.state.writeJson([FILE], { authenticators: this.list })
  }
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function isStored(v: unknown): v is Stored {
  if (!v || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  return typeof a.id === 'string' && typeof a.secret === 'string' && Array.isArray(a.recoveryCodeHashes) &&
    a.recoveryCodeHashes.every(h => typeof h === 'string') && typeof a.claimBefore === 'string' &&
    (a.claimedBy === null || typeof a.claimedBy === 'string') && typeof a.lastStep === 'number'
}
