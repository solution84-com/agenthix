/**
 * The machine following hq to a new address (host-management spec §13). hq tells the host service the address it
 * moves to over the host link (`hq.address`) before it stops. The machine keeps the address it pinned and goes on
 * dialling it; it checks the new one with the move check on its machine credential, with growing waits, and moves
 * its pin only once the check passes. `console hq-address` (pointMachine.ts) runs the same check once, for a
 * machine that was offline during the move. A machine on hq's own machine reaches hq on its local listener and
 * takes no notice.
 *
 * What it waits on is kept beside the pin (`link/hq-move.json`) with the address it was told it moves from, so
 * `status` says the move has not completed, and a pin that moved some other way leaves it behind. Once the pin moves,
 * the site's recorded address follows it: HQ told the site the same address, and the site follows by itself.
 */
import fs from 'node:fs'
import type { MoveCheckOutcome } from '@agenthix/core'
import { runMoveCheck, type MoveCheckOptions } from '@agenthix/core/host-crypto'
import type { StateFolder } from '../state/folder'
import { readPin, writePin } from './pin'
import { hqAddressProblem } from './socket'

const FILE = ['link', 'hq-move.json']
const FIRST_WAIT_MS = 15_000
const LONGEST_WAIT_MS = 5 * 60_000
const ADDRESS = /^https?:\/\/[^/\s?#]+$/i

export type HqMove = { from: string; to: string; since: string; problem: MoveCheckOutcome | null }

const baseOf = (a: string) => a.trim().replace(/\/+$/, '')
const same = (a: string, b: string) => baseOf(a).toLowerCase() === baseOf(b).toLowerCase()

/** The move the machine waits on, while its pin still names the address it was told hq moves from. */
export function readMove(state: StateFolder): HqMove | null {
  const pin = readPin(state)
  let v: Partial<HqMove> | null
  try {
    v = state.readJson(...FILE) as Partial<HqMove> | null
  } catch {
    return null
  }
  if (!pin || !v || typeof v.from !== 'string' || typeof v.to !== 'string' || typeof v.since !== 'string') return null
  if (!same(v.from, pin.hqAddress)) return null
  return { from: v.from, to: v.to, since: v.since, problem: (v.problem as MoveCheckOutcome | undefined) ?? null }
}

export function forgetMove(state: StateFolder): void {
  fs.rmSync(state.path(...FILE), { force: true })
}

/** Moves the pin to `address`, which passed the check, and forgets the move. */
export function movePin(state: StateFolder, address: string): void {
  const pin = readPin(state)
  if (!pin) return
  writePin(state, { ...pin, hqAddress: baseOf(address) })
  forgetMove(state)
}

export type FollowDeps = {
  state: StateFolder
  check?: (o: MoveCheckOptions) => Promise<MoveCheckOutcome>
  /** Dials hq again, from the pin. */
  redial: () => void
  now: () => Date
  later?: (run: () => void, ms: number) => () => void
  log: (line: string) => void
  /** Once the pin moved: the site's recorded address follows it (install/siteAddress.ts). */
  followed?: (from: string, to: string) => Promise<unknown>
}

const defaultLater = (run: () => void, ms: number) => {
  const timer = setTimeout(run, ms)
  timer.unref?.()
  return () => clearTimeout(timer)
}

export class HostAddressFollower {
  private cancel: (() => void) | null = null
  private attempt = 0
  private trying = false

  constructor(private readonly d: FollowDeps) {}

  /** hq's `hq.address` frame. Told the address the pin names, it stops waiting. */
  take(raw: unknown): void {
    const pin = readPin(this.d.state)
    const address = typeof raw === 'string' && raw.length <= 512 ? baseOf(raw) : ''
    if (!pin || pin.local || !ADDRESS.test(address)) return
    if (same(address, pin.hqAddress)) {
      forgetMove(this.d.state)
      this.stop()
      return
    }
    const problem = hqAddressProblem(address)
    if (problem) {
      this.d.log(`HQ says it moves to ${address}, which this machine will not follow: ${problem}.`)
      return
    }
    const before = readMove(this.d.state)
    const since = before && same(before.to, address) ? before.since : this.d.now().toISOString()
    const move: HqMove = { from: pin.hqAddress, to: address, since, problem: null }
    this.d.state.writeJson(FILE, move)
    this.d.log(`HQ says it moves to ${address}; this machine keeps ${pin.hqAddress} until the new address passes the check.`)
    this.attempt = 0
    this.schedule()
  }

  /** At start: carries on with a move a restart interrupted. */
  resume(): void {
    if (readMove(this.d.state)) this.schedule()
  }

  async tryNow(): Promise<MoveCheckOutcome | null> {
    if (this.trying) return null
    this.trying = true
    try {
      const move = readMove(this.d.state)
      const pin = readPin(this.d.state)
      if (!move || !pin) {
        this.stop()
        return null
      }
      const outcome = await (this.d.check ?? runMoveCheck)({ address: move.to, credential: pin.machineCredential, subject: 'host' })
      if (outcome !== 'passed') {
        if (readMove(this.d.state)?.to === move.to) this.d.state.writeJson(FILE, { ...move, problem: outcome })
        this.schedule()
        return outcome
      }
      movePin(this.d.state, move.to)
      this.d.log(`HQ at ${move.to} passed the check: this machine now reaches it there, and forgets ${move.from}.`)
      this.stop()
      this.d.redial()
      await this.d.followed?.(pin.hqAddress, move.to).catch(err => {
        this.d.log(`The site's record of HQ's address could not follow: ${err instanceof Error ? err.message : String(err)}`)
      })
      return outcome
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
      this.tryNow().catch(err => this.d.log(`Checking HQ's new address failed: ${err instanceof Error ? err.message : String(err)}`))
    }, wait)
  }
}
