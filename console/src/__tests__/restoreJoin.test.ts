/**
 * *Restore from a backup…* (adr-0119): a code for a lost site, the new machine joining with the backup it restores
 * under its binding, the fleet admin's confirmation, the signed ask to restore, and the lost machine replaced.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type HostRequest, type JoinRestoreClaim } from '@agenthix/core'
import { hostJoinBinding } from '@agenthix/core/host-crypto'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let fresh: FakeHost
const CLAIM: JoinRestoreClaim = { siteName: 'office', takenAt: '2026-10-14T02:00:00.000Z' }

beforeEach(async () => {
  h = await startHarness()
  ;[office, fresh] = await Promise.all([FakeHost.create(), FakeHost.create()])
  h.link.handle('join.open', () => ({ joinId: 'j-restore' }))
  h.link.handle('join.accept', () => ({ hostId: 'h-new' }))
  h.link.handle('join.refuse', () => ({ refused: true }))
  h.link.handle('host.disconnect', () => ({ disconnected: true }))
  auth = await h.signIn()
  fresh.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const presence = (hostId: string, fingerprint: string, online: boolean, since = new Date().toISOString()) =>
  h.link.emit('presence', { hostId, fingerprint, online, since })

async function joinRequest(code: string, claims: { restores?: JoinRestoreClaim } = { restores: CLAIM }) {
  return { joinId: 'j-restore', identity: fresh.keys.identity, machineName: 'new-server', ...claims, binding: await hostJoinBinding(code, fresh.fingerprint, claims) }
}

async function openRestore(): Promise<string> {
  const res = await api('/api/joins', 'POST', { restoreMachine: office.fingerprint })
  expect(res.status).toBe(201)
  return normalizeJoinCode(res.json.code as string)!
}

async function nextCommand(seen = 0): Promise<{ requestId: string; request: HostRequest }> {
  const end = Date.now() + 2_000
  while (Date.now() < end) {
    for (const env of h.link.envelopes.slice(seen)) {
      const opened = env.to === fresh.fingerprint ? await fresh.open(env) : null
      if (opened?.ok) return opened.message as { requestId: string; request: HostRequest }
    }
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error('no command for the new machine')
}

async function confirmed(): Promise<{ requestId: string; request: HostRequest }> {
  const code = await openRestore()
  h.link.emit('joinRequest', await joinRequest(code))
  await until(() => h.ctx.joins.get('j-restore')?.state === 'confirming')
  expect((await api('/api/joins/j-restore/confirm', 'POST', {})).status).toBe(200)
  presence('h-new', fresh.fingerprint, true)
  return nextCommand()
}

describe('restoring a lost site onto a new machine @SC-880', () => {
  it('opens a code for the lost site only, and never for a site whose machine is online', async () => {
    presence('h-office', office.fingerprint, true)
    expect((await api('/api/joins', 'POST', { restoreMachine: office.fingerprint })).json).toMatchObject({ message: expect.stringContaining('office-server is online, so it is not lost') })
    presence('h-office', office.fingerprint, false, '2026-10-15T09:14:00.000Z')
    await openRestore()
    expect(h.link.callsOf('join.open').map(c => c.purpose)).toEqual([{ kind: 'restoreSite', siteId: 'es-office' }])
    expect((await api('/api/joins', 'POST', { restoreMachine: 'f'.repeat(64) })).status).toBe(404)
  })

  it('shows the lost machine, when it was last heard from, and the backup the new machine says it restores', async () => {
    presence('h-office', office.fingerprint, false, '2026-10-15T09:14:00.000Z')
    const code = await openRestore()
    // A machine that does not say which backup it restores, or says it under no binding, is ignored.
    h.link.emit('joinRequest', await joinRequest(code, {}))
    h.link.emit('joinRequest', { ...(await joinRequest(code)), restores: { ...CLAIM, takenAt: '2026-10-15T02:00:00.000Z' } })
    await new Promise(r => setTimeout(r, 20))
    expect(h.ctx.joins.get('j-restore')?.state).toBe('waiting')
    h.link.emit('joinRequest', await joinRequest(code))
    await until(() => h.ctx.joins.get('j-restore')?.state === 'confirming')
    expect((await api('/api/joins/j-restore')).json).toMatchObject({
      machine: { name: 'new-server' },
      restore: { siteName: 'office', lostMachine: 'office-server', lastHeardAt: '2026-10-15T09:14:00.000Z', backupTakenAt: CLAIM.takenAt },
    })
  })

  it('asks the new machine, signed, to restore what its machine admin chose, then replaces the lost machine', async () => {
    const { requestId, request } = await confirmed()
    expect(request).toEqual({ op: 'backup.restore', target: 'site', source: { from: 'joined' } })
    expect(h.ctx.joins.get('j-restore')?.state).toBe('restoring')
    await h.ctx.commands.receive(await fresh.seal({
      kind: 'result', replyTo: requestId,
      result: { ok: true, op: 'backup.restore', result: { backup: { id: 'b1', night: '2026-10-13', takenAt: CLAIM.takenAt, sizeBytes: 1, holds: ['site'], inLocation: false }, executionSiteId: 'es-office', siteName: 'office' } } as never,
    }))
    await until(() => h.ctx.joins.get('j-restore')?.state === 'done')
    // The site is named after the machine it runs on now, whatever the machine said, and the record says so.
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ hostId: 'h-new', executionSiteId: 'es-office', siteName: 'new-server' })
    expect(h.link.callsOf('activity.record').find(c => c.action === 'command.backup.restore')).toMatchObject({ subject: 'office now runs on new-server, and is named new-server' })
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toBeNull()
    // Replaced by the restore, not disconnected by anyone: the record says so, and onto which machine.
    expect(h.ctx.hosts.disconnected.list()).toMatchObject([{ machineName: 'office-server', siteName: 'office', replacedBy: { machineName: 'new-server' } }])
    expect(h.link.callsOf('host.disconnect')).toEqual([{ hostId: 'h-office' }])
    // The site's credential is not hq's to remove: the restored site keeps it, renewed.
    expect(h.link.callsOf('site.remove' as never)).toEqual([])
    expect(h.link.callsOf('site.register')).toEqual([])
  })

  it('leaves the lost machine as it was when the restore is refused, in the host service’s words', async () => {
    const { requestId } = await confirmed()
    await h.ctx.commands.receive(await fresh.seal({
      kind: 'result', replyTo: requestId,
      result: { ok: false, op: 'backup.restore', refusal: { code: 'conflict', message: 'Not restored: Refused: office is connected to HQ right now. Nothing was changed.' } } as never,
    }))
    await until(() => h.ctx.joins.get('j-restore')?.state === 'failed')
    expect(h.ctx.joins.get('j-restore')?.problem).toBe('Not restored: Refused: office is connected to HQ right now. Nothing was changed.')
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toMatchObject({ executionSiteId: 'es-office' })
    expect(h.link.callsOf('host.disconnect')).toEqual([])
  })

  it('refuses to confirm, and spends the code, when the lost machine has come back', async () => {
    const code = await openRestore()
    h.link.emit('joinRequest', await joinRequest(code))
    await until(() => h.ctx.joins.get('j-restore')?.state === 'confirming')
    presence('h-office', office.fingerprint, true)
    const res = await api('/api/joins/j-restore/confirm', 'POST', {})
    expect(res.status).toBe(409)
    expect(res.json.message).toContain('office-server came back online, so it is not lost')
    expect(h.link.callsOf('join.accept')).toEqual([])
    expect(h.link.callsOf('join.refuse')).toEqual([{ joinId: 'j-restore' }])
  })
})
