import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import type { HostEnvelope } from '@agenthix/core'
import { plannedSubject } from '../activity'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

const SAM = { kind: 'fleetAdmin' as const, userId: 'u-sam', name: 'Sam Rivera' }
let h: Harness
let host: FakeHost

async function pin(fake: FakeHost, hostId: string) {
  await h.ctx.hosts.pin({
    fingerprint: fake.fingerprint, hostId, identity: fake.keys.identity, machineName: hostId, siteName: hostId,
    executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: SAM.userId,
  })
  fake.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
}

/** Sends a command and returns the envelope hq would have relayed. */
async function sendFiguresRead() {
  const answer = h.ctx.commands.send(host.fingerprint, { op: 'figures.read' }, SAM)
  await until(() => h.link.envelopes.length > 0)
  return { answer, envelope: h.link.envelopes.at(-1)! }
}

const FIGURES = { ok: true, op: 'figures.read', result: { machine: 'office-server' } } as const

beforeEach(async () => {
  h = await startHarness({ commandTimeouts: { short: 300, long: 300 } })
  host = await FakeHost.create()
  await pin(host, 'h-office')
})
afterEach(async () => { await h.close() })

describe('commands to a host service', () => {
  it('are signed by the console and sealed to the pinned host, so hq passes them unread @SC-866', async () => {
    const { answer, envelope } = await sendFiguresRead()
    expect(envelope.to).toBe(host.fingerprint)
    expect(JSON.stringify(envelope)).not.toContain('figures.read')
    const opened = await host.open(envelope)
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(opened.message).toMatchObject({ kind: 'request', by: SAM, request: { op: 'figures.read' } })
    answer.catch(() => {})
  })

  it("take the host's signed answer @SC-866", async () => {
    const { answer, envelope } = await sendFiguresRead()
    const opened = await host.open(envelope)
    if (!opened.ok) throw new Error('not opened')
    const requestId = (opened.message as { requestId: string }).requestId
    await h.ctx.commands.receive(await host.seal({ kind: 'result', replyTo: requestId, result: FIGURES as never }))
    await expect(answer).resolves.toEqual(FIGURES)
  })

  it('drop an answer signed by a key that is not pinned, and one whose signature was changed @SC-866', async () => {
    const { answer, envelope } = await sendFiguresRead()
    const opened = await host.open(envelope)
    if (!opened.ok) throw new Error('not opened')
    const requestId = (opened.message as { requestId: string }).requestId
    const result = { kind: 'result' as const, replyTo: requestId, result: FIGURES as never }

    // hq, or anyone, with keys of its own: not the pinned host.
    const impostor = await generateHostKeys('host')
    await h.ctx.commands.receive(await host.seal(result, impostor))
    // The host's real envelope, with its signature altered on the way.
    const genuine = await host.seal(result)
    const sig = genuine.sig
    const forged: HostEnvelope = { ...genuine, sig: (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1) }
    await h.ctx.commands.receive(forged)
    // No signature at all.
    await h.ctx.commands.receive({ ...genuine, sig: '' })

    expect(h.ctx.commands.dropped.map(d => d.reason)).toEqual(['unknown_sender', 'bad_signature', 'malformed'])
    await expect(answer).rejects.toThrow(/did not answer in time/)
  })

  it('drop an answer from another pinned host, and a replayed one @SC-866', async () => {
    const other = await FakeHost.create()
    await pin(other, 'h-other')
    const { answer, envelope } = await sendFiguresRead()
    const opened = await host.open(envelope)
    if (!opened.ok) throw new Error('not opened')
    const requestId = (opened.message as { requestId: string }).requestId
    const result = { kind: 'result' as const, replyTo: requestId, result: FIGURES as never }

    await h.ctx.commands.receive(await other.seal(result))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('unexpected')

    const genuine = await host.seal(result)
    await h.ctx.commands.receive(genuine)
    await expect(answer).resolves.toEqual(FIGURES)
    await h.ctx.commands.receive(genuine)
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('replayed')
  })

  it('drop an answer that names another operation than the one asked @SC-866', async () => {
    const { answer, envelope } = await sendFiguresRead()
    const opened = await host.open(envelope)
    if (!opened.ok) throw new Error('not opened')
    const requestId = (opened.message as { requestId: string }).requestId
    await h.ctx.commands.receive(await host.seal({
      kind: 'result', replyTo: requestId, result: { ok: true, op: 'erase', result: { purgeAfter: 'x' } },
    }))
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('unexpected')
    await expect(answer).rejects.toThrow()
  })

  it('are refused for a machine that is not pinned @SC-866', async () => {
    await expect(h.ctx.commands.send('a'.repeat(64), { op: 'figures.read' }, SAM)).rejects.toThrow(/not connected/)
    expect(h.link.envelopes).toHaveLength(0)
  })

  it('fail at once when hq says the machine is offline @SC-866', async () => {
    const { answer, envelope } = await sendFiguresRead()
    h.link.emit('undeliverable', envelope.id, 'recipient_offline')
    await expect(answer).rejects.toThrow(/not connected to HQ right now/)
  })

  it('pass only what the closed set allows through the API @SC-866', async () => {
    const { cookie, csrf } = await h.signIn()
    const res = await h.request(`/api/hosts/${host.fingerprint}/commands`, {
      method: 'POST', cookie, csrf, body: { request: { op: 'shell', command: 'rm -rf /' } },
    })
    expect(res.status).toBe(400)
    expect(h.link.envelopes).toHaveLength(0)
  })

  it('record what a fleet admin asked, and announce an erase @SC-867', async () => {
    const { cookie, csrf } = await h.signIn()
    const res = await h.request(`/api/hosts/${host.fingerprint}/commands`, {
      method: 'POST', cookie, csrf, body: { request: { op: 'erase', target: 'site' } },
    })
    expect(res.status).toBe(200)
    expect((res.json.command as { state: string }).state).toBe('failed')
    expect(h.link.callsOf('activity.record').find(c => c.action === 'command.erase')).toMatchObject({ announce: true, byUserId: 'u-sam' })
  })

  it('record planned maintenance with what it is and when, in words @SC-867', async () => {
    const { cookie, csrf } = await h.signIn()
    const at = '2030-10-19T02:00:00.000Z'
    await h.request(`/api/hosts/${host.fingerprint}/commands`, {
      method: 'POST', cookie, csrf, body: { request: { op: 'schedule', at, change: { op: 'upgrade', target: 'site', version: '0.3.0' } } },
    })
    expect(h.link.callsOf('activity.record').find(c => c.action === 'command.schedule'))
      .toMatchObject({ announce: false, subject: `h-office: upgrade to 0.3.0, at ${at}` })
  })
})

describe('the words of planned maintenance @SC-867', () => {
  it('say each kind by its name, and what it goes to', () => {
    const at = '2030-10-19T02:00:00.000Z'
    expect(plannedSubject('office-server', { op: 'schedule', at, change: { op: 'upgrade', target: 'site', version: '0.3.0' } }))
      .toBe(`office-server: upgrade to 0.3.0, at ${at}`)
    expect(plannedSubject('office-server', { op: 'schedule', at, change: { op: 'suspend', target: 'site' } })).toBe(`office-server: suspend, at ${at}`)
    expect(plannedSubject('office-server', { op: 'schedule', at, change: { op: 'resume', target: 'hq' } })).toBe(`office-server: resume, at ${at}`)
    expect(plannedSubject('office-server', {
      op: 'schedule', at, change: { op: 'capacity.set', ceilings: { memoryBytesPerContainer: 1, cpusPerContainer: 1, processesPerContainer: 1, containersAtOnce: 1 } },
    })).toBe(`office-server: change capacity, at ${at}`)
  })
})
