import { describe, expect, it } from 'vitest'
import { HOST_OPERATIONS, SCHEDULABLE_OPERATIONS } from '../operations.js'
import { parseHostRequest } from '../operationParse.js'

const EXPORT_ID = 'office-server-20261015T081500Z-export-0a1b2c3d.sealed'
const ceilings = { memoryBytesPerContainer: 4 * 1024 ** 3, cpusPerContainer: 1.5, processesPerContainer: 512, containersAtOnce: 4 }

/** One well-formed request for every operation in the closed set. */
const examples: Record<(typeof HOST_OPERATIONS)[number], unknown> = {
  'figures.read': { op: 'figures.read' },
  'logs.read': { op: 'logs.read', target: 'site', limit: 100 },
  install: { op: 'install', target: 'site', version: '0.2.0' },
  start: { op: 'start', target: 'hq' },
  stop: { op: 'stop', target: 'hq' },
  remove: { op: 'remove', target: 'site' },
  upgrade: { op: 'upgrade', target: 'hq', version: '0.2.1' },
  'backup.take': { op: 'backup.take' },
  'backup.list': { op: 'backup.list' },
  'backup.export': { op: 'backup.export', backupId: 'b1' },
  'backup.exportRead': { op: 'backup.exportRead', exportId: EXPORT_ID, offset: 524288 },
  'backup.exportDone': { op: 'backup.exportDone', exportId: EXPORT_ID },
  'backup.store': { op: 'backup.store', backupId: 'b1' },
  'backup.fetch': { op: 'backup.fetch', backupId: 'b1', key: 'k' },
  'backup.restore': { op: 'backup.restore', target: 'site', source: { from: 'machine', backupId: 'b1' } },
  'capacity.set': { op: 'capacity.set', ceilings },
  'address.set': { op: 'address.set', target: 'site', address: 'https://hq.acme.example' },
  'frontDoor.set': { op: 'frontDoor.set', on: false },
  schedule: { op: 'schedule', at: '2026-10-15T02:00:00Z', change: { op: 'upgrade', target: 'site', version: '0.2.1' } },
  'schedule.change': { op: 'schedule.change', changeId: 'c1', at: '2026-10-16T02:00:00Z' },
  'schedule.cancel': { op: 'schedule.cancel', changeId: 'c1' },
  suspend: { op: 'suspend', target: 'site' },
  resume: { op: 'resume', target: 'site' },
  erase: { op: 'erase', target: 'hq', confirmAddress: 'hq.acme.example' },
  move: {
    op: 'move', role: 'send', target: 'site', peer: 'f'.repeat(64),
    peerIdentity: { role: 'host', signingKey: 'a'.repeat(43), sealingKey: 'b'.repeat(43) }, peerName: 'new-server', transferId: 'transfer-1',
  },
}

describe('the closed set of host operations', () => {
  it('reads every operation in the set', () => {
    for (const [op, example] of Object.entries(examples)) {
      expect(parseHostRequest(example), op).toEqual({ ok: true, request: example })
    }
  })

  it('refuses anything outside it', () => {
    for (const op of ['shell', 'docker.run', 'file.read', 'backup.location.set', 'fleetAdmin.grant', 'hq.inviteAdmin', 'remote.on', '__proto__']) {
      expect(parseHostRequest({ op, command: 'rm -rf /' }), op).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
    }
    expect(parseHostRequest('figures.read')).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('drops fields the operation does not take', () => {
    expect(parseHostRequest({ op: 'start', target: 'site', command: 'sh -c id', path: '/etc' })).toEqual({
      ok: true, request: { op: 'start', target: 'site' },
    })
  })

  it('takes a pre-release as a published version, to install or upgrade to', () => {
    for (const version of ['1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-rc.3']) {
      expect(parseHostRequest({ op: 'install', target: 'site', version }), version).toEqual({ ok: true, request: { op: 'install', target: 'site', version } })
      expect(parseHostRequest({ op: 'upgrade', target: 'hq', version }), version).toEqual({ ok: true, request: { op: 'upgrade', target: 'hq', version } })
    }
    for (const version of ['1.0.0-alpha', '1.0.0-gamma.1', '1.0.0-rc.1+x']) {
      expect(parseHostRequest({ op: 'upgrade', target: 'hq', version }).ok, version).toBe(false)
    }
  })

  it('takes a development build for an install only', () => {
    expect(parseHostRequest({ op: 'install', target: 'site', version: 'dev' }))
      .toEqual({ ok: true, request: { op: 'install', target: 'site', version: 'dev' } })
  })

  it('refuses a request whose fields are not valid', () => {
    const malformed = [
      { op: 'start', target: 'machine' },
      { op: 'upgrade', target: 'hq', version: 'latest' },
      { op: 'upgrade', target: 'hq', version: 'dev' },
      { op: 'install', target: 'site', version: 'latest' },
      { op: 'capacity.set', ceilings: { ...ceilings, containersAtOnce: 0 } },
      { op: 'erase', target: 'hq' },
      { op: 'frontDoor.set', on: true },
      { op: 'backup.restore', target: 'site', source: { from: 'url', url: 'http://x' } },
      { op: 'logs.read', target: 'site', limit: -1 },
      { op: 'backup.exportRead', exportId: '../keys/backup-location-key.txt', offset: 0 },
      { op: 'backup.exportRead', exportId: 'office-server-20261015T081500Z-now-0a1b2c3d.sealed', offset: 0 },
      { op: 'backup.exportRead', exportId: EXPORT_ID, offset: -1 },
      { op: 'backup.exportRead', exportId: EXPORT_ID, offset: 1.5 },
      { op: 'backup.exportRead', exportId: EXPORT_ID },
      { op: 'backup.exportDone', exportId: 'exports/../sessions.json' },
      { op: 'schedule', at: 'tonight', change: { op: 'suspend', target: 'site' } },
      { op: 'move', role: 'send', target: 'site', peer: 'f'.repeat(64), transferId: 'transfer-1' },
      { op: 'move', role: 'send', target: 'site', peer: 'not a fingerprint', peerIdentity: { role: 'host', signingKey: 'a'.repeat(43), sealingKey: 'b'.repeat(43) }, peerName: 'new-server', transferId: 'transfer-1' },
      { op: 'move', role: 'receive', target: 'site', peer: 'f'.repeat(64), peerIdentity: { role: 'console', signingKey: 'a'.repeat(43), sealingKey: 'b'.repeat(43) }, transferId: 'transfer-1', siteName: 'office' },
    ]
    for (const r of malformed) expect(parseHostRequest(r), JSON.stringify(r)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it("restores a joining machine's own backup only as a site, and never at a later time (adr-0119)", () => {
    const joined = { op: 'backup.restore', target: 'site', source: { from: 'joined' } }
    expect(parseHostRequest(joined)).toEqual({ ok: true, request: joined })
    expect(parseHostRequest({ ...joined, source: { from: 'joined', path: '/srv/backups' } })).toEqual({ ok: true, request: joined })
    expect(parseHostRequest({ ...joined, target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(parseHostRequest({ op: 'schedule', at: '2026-10-15T02:00:00Z', change: joined })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('lists backups with nothing to carry, and never schedules a restore from the backup location, whose key is not kept', () => {
    expect(parseHostRequest({ op: 'backup.list', path: '/mnt/nas', key: 'k' })).toEqual({ ok: true, request: { op: 'backup.list' } })
    const fromLocation = { op: 'backup.restore', target: 'site', source: { from: 'location', backupId: 'b1', key: 'k' } }
    expect(parseHostRequest(fromLocation)).toEqual({ ok: true, request: fromLocation })
    expect(parseHostRequest({ op: 'schedule', at: '2026-10-15T02:00:00Z', change: fromLocation })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it("carries HQ's new address only on a move of hq", () => {
    const move = examples.move as Record<string, unknown>
    const hqMove = { ...move, target: 'hq', hqAddress: 'http://192.168.1.30:4100' }
    expect(parseHostRequest(hqMove)).toEqual({ ok: true, request: hqMove })
    expect(parseHostRequest({ ...move, target: 'hq' })).toEqual({ ok: true, request: { ...move, target: 'hq' } })
    expect(parseHostRequest({ ...move, hqAddress: 'http://192.168.1.30:4100' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(parseHostRequest({ ...hqMove, hqAddress: '' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it("carries the ports chosen for HQ and its Fleet Console on an install of hq and a move of hq received, and nowhere else @SC-1249", () => {
    const install = { op: 'install', target: 'hq', version: '0.2.0', address: 'https://hq.example.com' }
    expect(parseHostRequest({ ...install, hqPort: 7500, consolePort: 7501 })).toEqual({ ok: true, request: { ...install, hqPort: 7500, consolePort: 7501 } })
    expect(parseHostRequest({ ...install, consolePort: 7501 })).toEqual({ ok: true, request: { ...install, consolePort: 7501 } })
    expect(parseHostRequest(install)).toEqual({ ok: true, request: install })
    const receive = { ...(examples.move as Record<string, unknown>), role: 'receive', target: 'hq', siteName: 'office' }
    expect(parseHostRequest({ ...receive, hqPort: 7500 })).toEqual({ ok: true, request: { ...receive, hqPort: 7500 } })
    for (const r of [
      { ...install, hqPort: 0 }, { ...install, hqPort: 65536 }, { ...install, hqPort: 7500.5 }, { ...install, consolePort: '7501' },
      { op: 'install', target: 'site', version: '0.2.0', hqPort: 7500 },
      { ...receive, target: 'site', consolePort: 7501 },
      { ...receive, role: 'send', hqPort: 7500 },
    ]) expect(parseHostRequest(r), JSON.stringify(r)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('schedules only the changes of spec 14, never another operation', () => {
    for (const op of SCHEDULABLE_OPERATIONS) {
      expect(parseHostRequest({ op: 'schedule', at: '2026-10-15T02:00:00Z', change: examples[op] }).ok, op).toBe(true)
    }
    for (const change of [examples['backup.export'], examples['figures.read'], examples.schedule, { op: 'shell' }]) {
      expect(parseHostRequest({ op: 'schedule', at: '2026-10-15T02:00:00Z', change }).ok).toBe(false)
    }
  })

  it('needs the ports confirmed in so many words to turn the front door on', () => {
    expect(parseHostRequest({ op: 'frontDoor.set', on: true, confirmPorts: 'yes' }).ok).toBe(false)
    expect(parseHostRequest({ op: 'frontDoor.set', on: true, confirmPorts: true }).ok).toBe(true)
  })

  it('reads a certificate and its key together, longer than any other field, and refuses one without the other @SC-1081', () => {
    const certificate = `-----BEGIN CERTIFICATE-----\n${'A'.repeat(4000)}\n-----END CERTIFICATE-----`
    const privateKey = '-----BEGIN PRIVATE KEY-----\nB\n-----END PRIVATE KEY-----'
    const base = { op: 'frontDoor.set', on: true, confirmPorts: true, filesHost: 'files.acme.example' }
    expect(parseHostRequest({ ...base, certificate, privateKey })).toEqual({ ok: true, request: { ...base, certificate, privateKey } })
    expect(parseHostRequest({ ...base, certificate }).ok).toBe(false)
    expect(parseHostRequest({ ...base, privateKey }).ok).toBe(false)
    expect(parseHostRequest({ ...base, certificate: 'not pem', privateKey }).ok).toBe(false)
  })
})
