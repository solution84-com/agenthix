import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostFigures, HostEnvelope } from '@agenthix/core'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, flush, until } from './fakes'
import { startHarness, type Harness } from './harness'

// A host service sends figures only when asked (spec §6, `figures.read`): the Fleet Console keeps what it was told,
// and the fleet asks again for a machine whose figures are missing or old, without waiting for the answer.

export function sampleFigures(machine = 'office-server'): HostFigures {
  return {
    takenAt: '2026-10-15T08:00:00.000Z',
    machine: { name: machine, system: 'Linux 6.8 (x64)', dockerVersion: '27.3.1', hostServiceVersion: '0.2.0', upSince: '2026-10-01T00:00:00.000Z' },
    resources: { cpuLoad: 0.4, memory: { usedBytes: 3e9, totalBytes: 16e9 }, disk: { freeBytes: 2e11, totalBytes: 5e11 } },
    ceilings: { memoryBytesPerContainer: 8 * 1024 ** 3, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 6 },
    protections: { holding: true, rules: ['machine-ports'], checkedAt: '2026-10-15T08:00:00.000Z', problem: null },
    installs: [{ target: 'site', version: '0.2.0', state: 'running', since: '2026-10-03T00:00:00.000Z', healthy: true, problem: null }],
    backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost

const fleet = async () => (await h.request('/api/fleet', auth)).json as { hosts: { fingerprint: string; figures: HostFigures | null; figuresAt: string | null }[] }
const figuresAsked = () => h.link.envelopes.length
const online = (fake: FakeHost, hostId: string, isOnline = true) =>
  h.link.emit('presence', { hostId, fingerprint: fake.fingerprint, online: isOnline, since: new Date().toISOString() })

/** The host service's answer to the last command it was sent. */
async function answer(fake: FakeHost, envelope: HostEnvelope, result: unknown): Promise<void> {
  const opened = await fake.open(envelope)
  if (!opened.ok) throw new Error('not opened')
  const message = opened.message as { requestId: string; request: { op: string } }
  expect(message.request.op).toBe('figures.read')
  await h.ctx.commands.receive(await fake.seal({ kind: 'result', replyTo: message.requestId, result: result as never }))
}

beforeEach(async () => {
  h = await startHarness({ commandTimeouts: { short: 500, long: 500 } })
  auth = await h.signIn()
  office = await FakeHost.create()
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office-server', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
  office.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
})
afterEach(async () => { await h.close() })

describe('a machine’s figures @SC-889', () => {
  it('are kept when a figures.read is answered, whoever asked', async () => {
    const asked = h.ctx.commands.send(office.fingerprint, { op: 'figures.read' }, { kind: 'fleetAdmin', userId: 'u-sam', name: 'Sam Rivera' })
    await until(() => figuresAsked() === 1)
    await answer(office, h.link.envelopes[0], { ok: true, op: 'figures.read', result: sampleFigures() })
    await asked
    expect(h.ctx.presence.of(office.fingerprint).figures).toEqual(sampleFigures())
    expect(h.ctx.presence.of(office.fingerprint).figuresAt).not.toBeNull()
  })

  it('are not kept from an answer that is not figures', async () => {
    const asked = h.ctx.commands.send(office.fingerprint, { op: 'figures.read' }, { kind: 'fleetAdmin', userId: 'u-sam', name: 'Sam Rivera' })
    await until(() => figuresAsked() === 1)
    await answer(office, h.link.envelopes[0], { ok: true, op: 'figures.read', result: { machine: 'office-server' } })
    await asked
    expect(h.ctx.presence.of(office.fingerprint).figures).toBeNull()
  })

  it('are asked for by the fleet when missing, and arrive for the next read', async () => {
    online(office, 'h-office')
    expect((await fleet()).hosts[0].figures).toBeNull()
    await until(() => figuresAsked() === 1)
    await answer(office, h.link.envelopes[0], { ok: true, op: 'figures.read', result: sampleFigures() })
    await until(() => h.ctx.presence.of(office.fingerprint).figures !== null)
    expect((await fleet()).hosts[0].figures).toEqual(sampleFigures())
    expect(figuresAsked()).toBe(1)
  })

  it('are asked for once at a time, and the fleet does not wait for the answer', async () => {
    online(office, 'h-office')
    const started = Date.now()
    await fleet()
    await fleet()
    await fleet()
    expect(Date.now() - started).toBeLessThan(400)
    // The ask is sealed after the answer, so it can land later under load: wait for it, then check no second came.
    await until(() => figuresAsked() >= 1)
    await flush()
    expect(figuresAsked()).toBe(1)
  })

  it('are asked for again once older than a minute, and not before', async () => {
    online(office, 'h-office')
    h.ctx.presence.setFigures(office.fingerprint, sampleFigures(), new Date(Date.now() - 30_000))
    await fleet()
    await flush()
    expect(figuresAsked()).toBe(0)
    h.ctx.presence.setFigures(office.fingerprint, sampleFigures(), new Date(Date.now() - 61_000))
    await fleet()
    await until(() => figuresAsked() === 1)
  })

  it('are not asked of a machine that is offline', async () => {
    online(office, 'h-office', false)
    await fleet()
    await flush()
    expect(figuresAsked()).toBe(0)
  })

  it('are never recorded as something a fleet admin did', async () => {
    online(office, 'h-office')
    await fleet()
    await until(() => figuresAsked() === 1)
    await answer(office, h.link.envelopes[0], { ok: true, op: 'figures.read', result: sampleFigures() })
    await until(() => h.ctx.presence.of(office.fingerprint).figures !== null)
    expect(h.link.callsOf('activity.record').map(c => c.action)).not.toContain('command.figures.read')
    expect(h.link.callsOf('activity.record').map(c => c.action)).toEqual(['signedIn'])
  })

  it('asked again after an unanswered ask', async () => {
    online(office, 'h-office')
    await fleet()
    await until(() => figuresAsked() === 1)
    await new Promise(r => setTimeout(r, 600))
    await fleet()
    await until(() => figuresAsked() === 2)
  })
})
