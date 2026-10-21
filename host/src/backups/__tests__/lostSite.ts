/**
 * A site whose machine is lost (adr-0119): the old machine carried a site a Fleet Console added and backed it up to a
 * backup location; the new machine, running nothing, sees the same folder. Between them a stand-in for hq's relay, a
 * fake Fleet Console that confirms the join, and a stand-in for hq's renewal endpoint. Nothing here runs Docker.
 */
import fs from 'node:fs'
import { SITE_RESTORE_MACHINE_HEADER, type HostResult, type JoinRequest } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { controllerOperation } from '../../owner/controller'
import { ownerHandler } from '../../owner/dispatch'
import { readPin, writePin } from '../../link/pin'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'
import type { Progress } from '../../sockets/lineServer'
import { readSiteCredential } from '../../install/siteCompose'
import { setRenewPost } from '../renewal'

export const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const
export const ADDRESS = 'https://hq.acme.example'
export const CODE = '7KQ4-M2XD-46Q3'
export const LOCATION = '/mnt/nas/agenthix'
export const TAKEN_AT = '2026-10-14T02:00:00.000Z'

export type HqCall = { bearer: string; machine: string; body: Record<string, unknown> }
export type HqAnswer = { status: number; body: unknown } | 'no answer'

export type LostSite = {
  old: FakeMachine
  fresh: FakeMachine
  key: string
  backupCredential: string
  /** What hq's renewal endpoint was asked, in order; it answers from `hqAnswers`, then accepts. */
  hqCalls: HqCall[]
  hqAnswers: ((call: HqCall) => HqAnswer)[]
  joins: JoinRequest[]
  askOn: (m: FakeMachine, data: unknown, progress?: (p: Progress) => void, closed?: AbortSignal) => Promise<Record<string, any>>
  /** The Fleet Console's signed `backup.restore` from `joined`, once a fleet admin confirmed the new machine. */
  askForRestore: () => Promise<HostResult>
  cleanup: () => void
}

export const until = async (check: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

export async function lostSite(): Promise<LostSite> {
  const askOn: LostSite['askOn'] = (m, data, progress = () => {}, closed) =>
    ownerHandler(m.ctx)(data, progress, closed) as Promise<Record<string, any>>
  const old = fakeMachine()
  old.ctx.machine.name = 'office-server'
  const fleetConsole = await FakeConsole.make()
  writePin(old.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: ADDRESS, hostId: 'h-old',
    machineCredential: 'hmc_h-old_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  const installed = await controllerOperation(old.ctx, { op: 'install', target: 'site', version: '0.2.0' }, fleetAdmin, readPin(old.ctx.state)!)
  if (!installed.ok) throw new Error(installed.refusal.message)
  const backupCredential = readSiteCredential(old.ctx.state)!
  old.backups.databases.set('agenthix_site', Buffer.from('the site rows'))
  old.backups.folders.set('path:/home/sam/.agenthix/site/data', Buffer.from('the workspaces'))
  fs.mkdirSync(old.backups.onMachine(LOCATION), { recursive: true })
  const prepared = await askOn(old, { op: 'backup.location', path: LOCATION })
  await askOn(old, { op: 'backup.locationConfirm', pendingId: prepared.result.pendingId })
  old.ctx.now = () => new Date(TAKEN_AT)
  const taken = await askOn(old, { op: 'backup.take' })
  if (!taken.ok || !taken.result.backup.inLocation) throw new Error('The backup was not copied to the location.')

  const fresh = fakeMachine()
  fresh.ctx.machine.name = 'new-server'
  fs.cpSync(old.backups.onMachine('/mnt/nas'), fresh.backups.onMachine('/mnt/nas'), { recursive: true })
  const relay = new FakeRelay()
  fresh.ctx.dial = relay.dial
  fresh.ctx.link = { start: () => {}, stop: () => {}, connected: () => false, sendEnvelope: () => {} }
  const joins: JoinRequest[] = []
  relay.onJoin = async (join, conn) => {
    joins.push(join)
    await conn.deliver('host.joined', {
      hostId: 'h-new', machineCredential: 'hmc_h-new_0123456789abcdef', acceptance: await fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity),
    })
  }
  const hqCalls: HqCall[] = []
  const hqAnswers: LostSite['hqAnswers'] = []
  setRenewPost(fresh.ctx, async (_url, init) => {
    const headers = init.headers as Record<string, string>
    const call = { bearer: headers.Authorization.replace(/^Bearer /, ''), machine: headers[SITE_RESTORE_MACHINE_HEADER], body: JSON.parse(String(init.body)) }
    hqCalls.push(call)
    const answer = (hqAnswers.shift() ?? (() => ({ status: 200, body: { executionSiteId: 'es-1', siteName: 'office' } })))(call)
    if (answer === 'no answer') throw new Error('connect ECONNREFUSED')
    return { status: answer.status, json: async () => answer.body }
  })
  return {
    old, fresh, key: prepared.result.key, backupCredential, hqCalls, hqAnswers, joins, askOn,
    askForRestore: () => controllerOperation(fresh.ctx, { op: 'backup.restore', target: 'site', source: { from: 'joined' } }, fleetAdmin, readPin(fresh.ctx.state)!),
    cleanup: () => {
      old.cleanup()
      fresh.cleanup()
    },
  }
}
