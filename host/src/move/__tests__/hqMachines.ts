/**
 * Two machines for hq's move: the old one running hq, its default site and the Fleet Console beside them, the new one
 * connected to that Fleet Console and running nothing, and between them a stand-in for hq's relay — which, as in life,
 * passes nothing while hq runs on neither machine, and which a test may make alter or drop frames. Nothing runs Docker.
 */
import { EnvelopeReplayGuard, fingerprintOf } from '@agenthix/core/host-crypto'
import type { HostMessage, HostResult, MoveRequest } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { install } from '../../install/install'
import { controllerOperation } from '../../owner/controller'
import { readPin, writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { readStore } from '../../scheduled/store'
import { tickScheduled } from '../../scheduled/scheduler'
import { deliver, setTransferWire } from '../wire'
import { receiveMoves } from '../receive'
import { setTimings } from '../timings'
import { fleetAdmin, QUICK } from './twoMachines'

export const OLD = 'http://192.168.1.20:4100'
export const NEW = 'http://192.168.1.30:4100'
export const HQ = 'agenthix-hq'
export const SITE = 'agenthix-site'
export const CONSOLE = 'agenthix-console'

export type HqTwo = {
  old: FakeMachine
  fresh: FakeMachine
  told: { old: HostMessage[]; new: HostMessage[] }
  /** What hq's relay does with a frame from `from`: pass it (as given back), or drop it (null). */
  hq: { act: (from: 'old' | 'new', type: string, payload: Record<string, unknown>) => Record<string, unknown> | null }
  /** Each control-socket command hq was given, on each machine. */
  said: { old: string[][]; new: string[][] }
  as: (m: FakeMachine, request: unknown) => Promise<HostResult>
  arm: () => Promise<HostResult>
  sendNow: () => Promise<HostResult>
  run: () => Promise<void>
  moveRequest: (role: 'send' | 'receive') => Promise<MoveRequest>
  cleanup: () => void
}

const ok = (text = 'done', data: Record<string, unknown> = {}) => ({ ok: true as const, text, data })

export async function hqMachines(): Promise<HqTwo> {
  const old = fakeMachine()
  const fresh = fakeMachine()
  old.ctx.machine.name = 'hq-box'
  fresh.ctx.machine.name = 'new-server'
  await install(old.ctx, { address: OLD }, () => {})
  // Installing waited on the old machine's clock; the two keep the same time, as envelopes between them need.
  await fresh.ctx.sleep(old.ctx.now().getTime() - fresh.ctx.now().getTime())
  const fleetConsole = await FakeConsole.make()
  const pin = (hostId: string, hqAddress: string, local: boolean) => ({
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress,
    hostId, machineCredential: `hmc_${hostId}_0123456789abcdef`, pinnedAt: '2026-10-14T09:00:00.000Z', local,
  })
  writePin(old.ctx.state, pin('h-old', 'http://127.0.0.1:4100', true))
  writePin(fresh.ctx.state, pin('h-new', OLD, false))
  for (const m of [old, fresh]) {
    setTimings(m.ctx, QUICK)
    Object.assign(m.hq, { 'read-only': ok(), 'address-move': ok('told', { sites: { told: 1, of: 1 }, hosts: { told: 1, of: 1 }, console: false }), 'transfer-open': ok('Open.', { opened: true }) })
  }
  old.backups.databases.set('agenthix_hq', Buffer.from('the hq rows'))
  old.backups.databases.set('agenthix_site', Buffer.from('the site rows'))
  old.backups.folders.set('volume:agenthix-hq-storage', Buffer.from('the uploaded files'))
  old.backups.folders.set('path:/home/sam/.agenthix/site/data', Buffer.from('the workspaces'))
  old.backups.folders.set('volume:agenthix-console-state', Buffer.from('the fleet console keys'))

  const said: HqTwo['said'] = { old: [], new: [] }
  for (const [side, m] of [['old', old], ['new', fresh]] as const) {
    const run = m.ctx.hqControl.run.bind(m.ctx.hqControl)
    m.ctx.hqControl.run = async (command, args = []) => {
      if (command !== 'status') said[side].push([command, ...args])
      return run(command, args)
    }
  }

  const told: HqTwo['told'] = { old: [], new: [] }
  // The relay is hq's: it passes frames only while hq runs on one of the two machines.
  const hq: HqTwo['hq'] = { act: (_from, _type, payload) => payload }
  const wire = (from: 'old' | 'new', to: FakeMachine) => ({
    send: (type: string, payload: unknown) => {
      const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
      // On the wire once sent: what hq stopping afterwards changes is whether the next frame passes, not this one.
      const passing = old.up.has(HQ) || fresh.up.has(HQ)
      setTimeout(() => {
        if (!passing) return
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
  const oldKeys = await hostKeys(old.ctx.state)
  const newKeys = await hostKeys(fresh.ctx.state)
  const oldFp = await fingerprintOf(oldKeys.identity)
  const newFp = await fingerprintOf(newKeys.identity)
  const moveRequest = async (role: 'send' | 'receive'): Promise<MoveRequest> => role === 'send'
    ? { op: 'move', role, target: 'hq', peer: newFp, peerIdentity: newKeys.identity, peerName: 'new-server', transferId: 'transfer-hq-0001', hqAddress: NEW }
    : { op: 'move', role, target: 'hq', peer: oldFp, peerIdentity: oldKeys.identity, peerName: 'hq-box', transferId: 'transfer-hq-0001', siteName: 'hq-box', hqAddress: NEW }

  return {
    old, fresh, told, hq, said, as, moveRequest,
    arm: async () => as(fresh, await moveRequest('receive')),
    sendNow: async () => as(old, await moveRequest('send')),
    run: async () => {
      await old.ctx.sleep(1500)
      for (;;) {
        await tickScheduled(old.ctx)
        if (readStore(old.ctx.state).entries.find(e => e.change.kind === 'move')?.endedAt) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    },
    cleanup: () => {
      old.cleanup()
      fresh.cleanup()
    },
  }
}
