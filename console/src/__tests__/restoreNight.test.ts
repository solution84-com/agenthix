import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BackupListed, HostMessage, HostRequest, HostResult } from '@agenthix/core'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost } from './fakes'
import { startHarness, type Harness } from './harness'

const KEY = '9F3K-QX72-M8KD-4RT6-HZ0P-W5VB'
const MONDAY: BackupListed = {
  id: '0a1b2c3d', night: '2026-10-12', takenAt: '2026-10-13T02:00:04.000Z', kind: 'nightly', holds: ['site'], sizeBytes: 52_428_800, onMachine: true, inLocation: true,
}
const EARLIER: BackupListed = { ...MONDAY, id: '4e5f6a7b', night: '2026-09-20', takenAt: '2026-09-21T02:00:04.000Z', onMachine: false }

let h: Harness
let host: FakeHost
let seen = 0
/** What the machine was asked, in order. */
let asked: HostRequest[]
let listing: { backups: BackupListed[]; location: 'none' | 'read' | 'unreadable' }

async function pin(fake: FakeHost, name: string, hqMachine = false) {
  await h.ctx.hosts.pin({
    fingerprint: fake.fingerprint, hostId: `h-${name}`, identity: fake.keys.identity, machineName: name, siteName: name,
    executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: 'u-sam', ...(hqMachine ? { hqMachine: true } : {}),
  })
  fake.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
}

/** The machine's side: answers the list, and every restore, as a host service would. */
async function answerRequests(): Promise<void> {
  while (seen < h.link.envelopes.length) {
    const envelope = h.link.envelopes[seen++]
    const opened = await host.open(envelope)
    if (!opened.ok) continue
    const message = opened.message as { requestId: string; request: HostRequest }
    const r = message.request
    asked.push(r)
    let result: HostResult
    if (r.op === 'backup.list') result = { ok: true, op: r.op, result: listing }
    else if (r.op === 'backup.restore') result = { ok: true, op: r.op, result: { backup: { id: MONDAY.id, night: MONDAY.night, takenAt: MONDAY.takenAt, sizeBytes: 1, holds: ['site'], inLocation: false } } }
    else if (r.op === 'schedule') result = { ok: true, op: r.op, result: { change: { id: '1' } as never } }
    else continue
    const reply: HostMessage = { kind: 'result', replyTo: message.requestId, result }
    await h.ctx.commands.receive(await host.seal(reply))
  }
}

let pump: ReturnType<typeof setInterval>
beforeEach(async () => {
  h = await startHarness({ commandTimeouts: { short: 400, long: 400 } })
  host = await FakeHost.create()
  await pin(host, 'office-server')
  seen = 0
  asked = []
  listing = { backups: [MONDAY, EARLIER], location: 'read' }
  pump = setInterval(() => { void answerRequests() }, 2)
})
afterEach(async () => {
  clearInterval(pump)
  await h.close()
})

const restores = () => asked.filter(r => r.op === 'backup.restore' || r.op === 'schedule')

async function restore(body: Record<string, unknown>) {
  const { cookie, csrf } = await h.signIn()
  return h.request(`/api/hosts/${host.fingerprint}/restore`, { method: 'POST', cookie, csrf, body })
}

describe("a machine's nights", () => {
  it('are what the machine listed, in its sealed answer, and nothing is recorded for reading them', async () => {
    const { cookie, csrf } = await h.signIn()
    const res = await h.request(`/api/hosts/${host.fingerprint}/backups`, { cookie, csrf })
    expect(res.status).toBe(200)
    expect(res.json).toEqual(listing)
    expect(h.link.callsOf('activity.record').filter(c => String(c.action).startsWith('command.'))).toEqual([])
  })
})

describe('Restore…', () => {
  it("needs the machine's name typed to confirm, and asks nothing of the machine without it", async () => {
    const res = await restore({ backupId: MONDAY.id, from: 'machine', confirmName: 'office' })
    expect(res.status).toBe(400)
    expect(res.json.message).toBe("Type the machine's name, office-server, to confirm.")
    expect(h.link.envelopes).toHaveLength(0)
  })

  it('restores a night on the machine now, and records it with the night the machine listed', async () => {
    const res = await restore({ backupId: MONDAY.id, from: 'machine', confirmName: ' Office-Server ' })
    expect(res.status).toBe(200)
    expect((res.json.command as { state: string }).state).toBe('done')
    expect(restores()).toEqual([{ op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: MONDAY.id } }])
    expect(h.link.callsOf('activity.record').find(c => c.action === 'command.backup.restore'))
      .toMatchObject({ byUserId: 'u-sam', subject: 'office-server: back to the night of 2026-10-12', announce: false })
  })

  it("restores HQ's machine as HQ, with its site", async () => {
    host = await FakeHost.create()
    await pin(host, 'hq-box', true)
    listing = { backups: [{ ...MONDAY, holds: ['hq', 'site'] }], location: 'none' }
    expect((await restore({ backupId: MONDAY.id, from: 'machine', confirmName: 'hq-box' })).status).toBe(200)
    expect(restores()).toEqual([{ op: 'backup.restore', target: 'hq', source: { from: 'machine', backupId: MONDAY.id } }])
  })

  it('schedules a night on the machine at a time, recorded as planned maintenance', async () => {
    const at = '2030-10-19T02:00:00.000Z'
    expect((await restore({ backupId: MONDAY.id, from: 'machine', confirmName: 'office-server', at })).status).toBe(200)
    expect(restores()).toEqual([{ op: 'schedule', at, change: { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: MONDAY.id } } }])
    expect(h.link.callsOf('activity.record').find(c => c.action === 'command.schedule'))
      .toMatchObject({ subject: `office-server: restore to the night of 2026-10-12, at ${at}` })
  })

  it('restores a copy in the backup location only now, with its key sealed to the machine and never recorded', async () => {
    const later = await restore({ backupId: EARLIER.id, from: 'location', key: KEY, confirmName: 'office-server', at: '2030-10-19T02:00:00.000Z' })
    expect(later.status).toBe(400)
    expect(later.json.message).toMatch(/^A copy in the backup location is restored now, with its key/)
    const res = await restore({ backupId: EARLIER.id, from: 'location', key: KEY, confirmName: 'office-server' })
    expect(res.status).toBe(200)
    expect(restores()).toEqual([{ op: 'backup.restore', target: 'site', source: { from: 'location', backupId: EARLIER.id, key: KEY } }])
    for (const e of h.link.envelopes) expect(JSON.stringify(e)).not.toContain(KEY)
    expect(JSON.stringify(h.link.callsOf('activity.record'))).not.toContain(KEY)
    expect(JSON.stringify(res.json)).not.toContain(KEY)
  })

  it('refuses a night the machine no longer lists, or not where it was asked from', async () => {
    expect((await restore({ backupId: 'ffffffff', from: 'machine', confirmName: 'office-server' })).status).toBe(404)
    const notOnMachine = await restore({ backupId: EARLIER.id, from: 'machine', confirmName: 'office-server' })
    expect(notOnMachine.status).toBe(404)
    expect(notOnMachine.json.message).toBe('That backup is no longer on office-server. Choose another night.')
    expect(restores()).toEqual([])
  })

  it('is the only way to restore a night: the command route refuses it, now or at a time', async () => {
    const { cookie, csrf } = await h.signIn()
    const change = { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: MONDAY.id } }
    for (const request of [change, { op: 'schedule', at: '2030-10-19T02:00:00.000Z', change }]) {
      const res = await h.request(`/api/hosts/${host.fingerprint}/commands`, { method: 'POST', cookie, csrf, body: { request } })
      expect(res.status).toBe(400)
    }
    expect(h.link.envelopes).toHaveLength(0)
  })
})
