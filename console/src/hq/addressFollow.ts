/**
 * The Fleet Console following hq to a new address (host-management spec §13). The Fleet Console does not move with
 * hq: it dials hq's new address once that address passes the move check on its lasting credential. hq tells it the
 * address over the console link (`hq.address`) before it stops, and it keeps dialling the old one, checking the new
 * one with growing waits; `console hq-address` on its machine runs the same check once (`hq-address` on the control
 * socket). One on hq's own machine reaches hq on its local listener, with the pairing secret, and takes no notice.
 *
 * What it followed is kept in its state folder with the `CONSOLE_HQ_ADDRESS` it was followed from, so a restart
 * keeps it while the host service has not set another address.
 */
import type { MoveCheckOutcome } from '@agenthix/core'
import { runMoveCheck, type MoveCheckOptions } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { hqAddressProblem } from './addressPolicy'

const FILE = 'hq-address.json'
const FIRST_WAIT_MS = 15_000
const LONGEST_WAIT_MS = 5 * 60_000
const ADDRESS = /^https?:\/\/[^/\s?#]+$/i

type Kept = {
  /** The address it followed hq to, and the `CONSOLE_HQ_ADDRESS` it was followed from. */
  followed?: { address: string; from: string }
  moving?: { to: string; since: string; problem: MoveCheckOutcome | null }
}

const baseOf = (a: string) => a.trim().replace(/\/+$/, '')
const same = (a: string, b: string) => baseOf(a).toLowerCase() === baseOf(b).toLowerCase()

export type AddressFollowDeps = {
  state: StateFolder
  /** `CONSOLE_HQ_ADDRESS`, as the host service set it. */
  configured: string
  /** On hq's machine it is admitted by the pairing secret and dials hq's local listener: it never follows. */
  onHqMachine: boolean
  /** Its lasting credential; null while it holds none. */
  credential: () => string | null
  /** Dials hq at this address from now on. */
  redial: (address: string) => void
  check?: (o: MoveCheckOptions) => Promise<MoveCheckOutcome>
  now?: () => Date
  later?: (run: () => void, ms: number) => () => void
  log?: (line: string) => void
}

const defaultLater = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

export class ConsoleAddressFollower {
  private cancel: (() => void) | null = null
  private attempt = 0
  private trying = false

  constructor(private readonly d: AddressFollowDeps) {}

  private read(): Kept {
    try {
      const v = this.d.state.readJson(FILE) as Kept | null
      return v && typeof v === 'object' ? v : {}
    } catch {
      return {}
    }
  }

  private write(k: Kept): void {
    this.d.state.writeJson([FILE], k)
  }

  /** The address to dial: the one it followed hq to, while `CONSOLE_HQ_ADDRESS` is still the one it came from. */
  current(): string {
    const f = this.read().followed
    return f && typeof f.address === 'string' && typeof f.from === 'string' && same(f.from, this.d.configured) ? f.address : this.d.configured
  }

  moving(): Kept['moving'] | null {
    return this.read().moving ?? null
  }

  /** hq's `hq.address` frame. Told the address it dials, it stops waiting. */
  take(raw: unknown): void {
    if (this.d.onHqMachine) return
    const address = typeof raw === 'string' && raw.length <= 512 ? baseOf(raw) : ''
    if (!ADDRESS.test(address)) return
    const kept = this.read()
    if (same(address, this.current())) {
      this.write({ followed: kept.followed })
      this.stop()
      return
    }
    void hqAddressProblem(address, { onHqMachine: false }).then(problem => {
      if (problem) return this.d.log?.(`hq says it moves to ${address}, which this Fleet Console will not follow: ${problem}`)
      const since = kept.moving && same(kept.moving.to, address) ? kept.moving.since : (this.d.now?.() ?? new Date()).toISOString()
      this.write({ followed: kept.followed, moving: { to: address, since, problem: null } })
      this.d.log?.(`hq says it moves to ${address}; this Fleet Console keeps ${this.current()} until the new address passes the check.`)
      this.attempt = 0
      this.schedule()
    })
  }

  resume(): void {
    if (this.moving()) this.schedule()
  }

  /** One check of `address` (`console hq-address`), or of the move waited on; it switches only when it passes. */
  async point(raw: string | null = null): Promise<{ address: string; outcome: MoveCheckOutcome } | null> {
    if (this.trying) throw new Error('A check of hq\'s address is already running.')
    const address = raw === null ? this.moving()?.to ?? null : baseOf(raw)
    if (!address) return null
    if (this.d.onHqMachine) throw new Error("This Fleet Console runs on hq's machine and reaches hq there.")
    const problem = await hqAddressProblem(address, { onHqMachine: false })
    if (problem) throw new Error(problem)
    const credential = this.d.credential()
    if (!credential) throw new Error('This Fleet Console holds no credential for hq yet, so it cannot prove itself to any address.')
    this.trying = true
    try {
      const outcome = await (this.d.check ?? runMoveCheck)({ address, credential, subject: 'console' })
      const kept = this.read()
      if (outcome !== 'passed') {
        if (kept.moving && same(kept.moving.to, address)) this.write({ ...kept, moving: { ...kept.moving, problem: outcome } })
        return { address, outcome }
      }
      this.write({ followed: { address, from: this.d.configured } })
      this.stop()
      this.d.log?.(`hq at ${address} passed the check: this Fleet Console dials it from now on.`)
      this.d.redial(address)
      return { address, outcome }
    } finally {
      this.trying = false
    }
  }

  stop(): void {
    this.cancel?.()
    this.cancel = null
  }

  private schedule(): void {
    this.stop()
    const wait = Math.min(LONGEST_WAIT_MS, FIRST_WAIT_MS * 2 ** this.attempt)
    this.attempt = Math.min(this.attempt + 1, 8)
    this.cancel = (this.d.later ?? defaultLater)(() => {
      this.cancel = null
      this.point()
        .then(r => { if (r && r.outcome !== 'passed') this.schedule() })
        .catch(err => this.d.log?.(`Checking hq's new address failed: ${err instanceof Error ? err.message : String(err)}`))
    }, wait)
  }
}
