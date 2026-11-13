/**
 * Two machines for a site's move: the old one carrying a site a Fleet Console added, the new one connected to the same
 * Fleet Console and running nothing, and between them a stand-in for hq's relay that passes each transfer frame on —
 * or, as a takeover of hq might, alters or drops it. Nothing here runs Docker.
 */
import { EnvelopeReplayGuard, fingerprintOf } from '@agenthix/core/host-crypto'
import type { HostMessage, HostResult, MoveRequest } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { controllerOperation } from '../../owner/controller'
import { readPin, writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { readStore } from '../../scheduled/store'
import { tickScheduled } from '../../scheduled/scheduler'
import { deliver, setTransferWire } from '../wire'
import { receiveMoves } from '../receive'
import { setTimings, type MoveTimings } from '../timings'

export const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const

export const QUICK: MoveTimings = { takeoverMs: 800, idleMs: 3_000, heartbeatMs: 50, pollMs: 20, stopMs: 50 }

/** What hq's relay does with a frame from `from`: pass it (as given back), or drop it (null). */
export type Hq = (from: 'old' | 'new', type: string, payload: Record<string, unknown>) => Record<string, unknown> | null

export type Two = {
  old: FakeMachine
  fresh: FakeMachine
  console: FakeConsole
  /** What each machine told the Fleet Console, in order. */
  told: { old: HostMessage[]; new: HostMessage[] }
  /** Every frame hq was given, by the machine that sent it. */
  passed: { from: 'old' | 'new'; type: string }[]
  hq: { act: Hq }
  oldFp: string
  newFp: string
  as: (m: FakeMachine, request: unknown) => Promise<HostResult>
  arm: () => Promise<HostResult>
  sendNow: () => Promise<HostResult>
  /** Runs the scheduler on the old machine until the move ends there. */
  run: () => Promise<void>
  moveRequest: (role: 'send' | 'receive') => Promise<MoveRequest>
  cleanup: () => void
}

const pinOf = (fleetConsole: FakeConsole, hostId: string) => ({
  console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
  hostId, machineCredential: `hmc_${hostId}_0123456789abcdef`, pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
})

export async function twoMachines(): Promise<Two> {
  const old = fakeMachine()
  const fresh = fakeMachine()
  old.ctx.machine.name = 'office-server'
  fresh.ctx.machine.name = 'new-server'
  const fleetConsole = await FakeConsole.make()
  writePin(old.ctx.state, pinOf(fleetConsole, 'h-old'))
  writePin(fresh.ctx.state, pinOf(fleetConsole, 'h-new'))
  for (const m of [old, fresh]) setTimings(m.ctx, QUICK)
  const told: Two['told'] = { old: [], new: [] }
  const passed: Two['passed'] = []
  const hq: Two['hq'] = { act: (_from, _type, payload) => payload }
  const wire = (from: 'old' | 'new', to: FakeMachine) => ({
    send: (type: string, payload: unknown) => {
      passed.push({ from, type })
      // As over a websocket: a copy, a turn later.
      const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
      setTimeout(() => {
        const out = hq.act(from, type, copy)
        if (out) deliver(to.ctx, type, out)
      }, 0)
      return true
    },
    toConsole: async (message: HostMessage) => { told[from].push(message) },
    replay: new EnvelopeReplayGuard(0),
  })
  setTransferWire(old.ctx, wire('old', fresh))
  setTransferWire(fresh.ctx, wire('new', old))
  receiveMoves(fresh.ctx, () => readPin(fresh.ctx.state))

  const as = (m: FakeMachine, request: unknown) => controllerOperation(m.ctx, request as never, fleetAdmin, readPin(m.ctx.state)!)
  // The site the Fleet Console added to the old machine, with the credential that machine made for it.
  const installed = await as(old, { op: 'install', target: 'site', version: '0.2.0' })
  if (!installed.ok) throw new Error(installed.refusal.message)
  old.backups.databases.set('agenthix_site', Buffer.from('the site rows'))
  old.backups.folders.set('path:/home/sam/.agenthix/site/data', Buffer.from('the workspaces'))

  const oldKeys = await hostKeys(old.ctx.state)
  const newKeys = await hostKeys(fresh.ctx.state)
  const oldFp = await fingerprintOf(oldKeys.identity)
  const newFp = await fingerprintOf(newKeys.identity)
  const moveRequest = async (role: 'send' | 'receive'): Promise<MoveRequest> => role === 'send'
    ? { op: 'move', role, target: 'site', peer: newFp, peerIdentity: newKeys.identity, peerName: 'new-server', transferId: 'transfer-0001' }
    : { op: 'move', role, target: 'site', peer: oldFp, peerIdentity: oldKeys.identity, peerName: 'office-server', transferId: 'transfer-0001', siteName: 'office-server' }

  const two: Two = {
    old, fresh, console: fleetConsole, told, passed, hq, oldFp, newFp, as, moveRequest,
    arm: async () => as(fresh, await moveRequest('receive')),
    sendNow: async () => as(old, await moveRequest('send')),
    run: async () => {
      await old.ctx.sleep(1500)
      for (;;) {
        await tickScheduled(old.ctx)
        const entry = readStore(old.ctx.state).entries.find(e => e.change.kind === 'move')
        if (entry?.endedAt) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    },
    cleanup: () => {
      old.cleanup()
      fresh.cleanup()
    },
  }
  return two
}

/** The new machine's site answers hq once it runs: what its control socket says. */
export function siteAnswersHq(m: FakeMachine, answers: boolean): void {
  m.siteReport.value = answers ? { type: 'status', status: { hq: { connected: true } } } : { type: 'status', status: { hq: { connected: false }, problem: null } }
}

/**
 * Moves `m`'s clock on, two minutes at a time, until `moving` ends: the time a machine waits out before it gives up.
 * Not one jump: under load the machine can learn what it waits for only after a single jump, set its deadline from
 * then, and wait for ever on a clock nothing moves again.
 */
export const timePassesUntil = async (m: { ctx: { sleep: (ms: number) => Promise<void> } }, moving: Promise<unknown>) => {
  let ended = false
  void moving.then(() => { ended = true }, () => { ended = true })
  await until(() => {
    if (!ended) void m.ctx.sleep(120_000)
    return ended
  }, 10_000)
  await moving
}

export const until = async (check: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
