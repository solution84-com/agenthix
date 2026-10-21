/**
 * Moving the Fleet Console (spec §7): the running one hands its machines to a new one only when the new one proves it
 * holds the handover code, which hq never sees; the new one takes them only from the Fleet Console that made the code.
 * Two Fleet Consoles, each with a fake hq link; the test plays hq between them — honestly, and as a takeover.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatJoinCode, consoleCodeKind, normalizeJoinCode, type HostIdentity, type ConsoleLinkMethods } from '@agenthix/core'
import {
  EnvelopeReplayGuard, fingerprintOf, generateHostKeys, consoleCodeLookup, newConsoleBinding, oldConsoleBinding, sealEnvelope,
  signHandoverCertificate, verifyHandoverCertificate, type HostKeys,
} from '@agenthix/core/host-crypto'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

type Accept = ConsoleLinkMethods['handover.accept']['params']

let running: Harness
let next: Harness | null = null
let host: FakeHost
let hqBox: FakeHost
let code: string

beforeEach(async () => {
  running = await startHarness({ machineName: 'hq-box' })
  running.link.handle('handover.open', () => ({ handoverId: 'ho-1' }))
  running.link.handle('handover.accept', () => ({ passed: true }))
  running.link.handle('handover.close', () => ({ closed: true }))
  host = await FakeHost.create()
  await running.ctx.hosts.pin({
    fingerprint: host.fingerprint, hostId: 'h-office', identity: host.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    notifyIfSilent: false,
  })
  hqBox = await FakeHost.create()
  await running.ctx.hosts.pin({
    fingerprint: hqBox.fingerprint, hostId: 'h-hq', identity: hqBox.keys.identity, machineName: 'hq-box',
    siteName: 'hq', executionSiteId: 'es-hq', connectedAt: new Date().toISOString(), connectedBy: null, hqMachine: true,
  })
  host.consoleIdentity = runningKeys().identity
  hqBox.consoleIdentity = runningKeys().identity
  code = normalizeJoinCode((await running.ctx.handoverOut.openCode()).code)!
})
afterEach(async () => {
  await running.close()
  await next?.close()
  next = null
})

const runningKeys = () => running.state.readJson('keys.json') as HostKeys

async function startNext(withCode = code, replay?: EnvelopeReplayGuard): Promise<Harness> {
  next = await startHarness({ machineName: 'laptop', hqCode: withCode, replay })
  return next
}

/** The new Fleet Console's half, as it sends it when its connection opens. */
async function askOf(h: Harness): Promise<{ identity: HostIdentity; machineName: string; binding: string }> {
  h.link.emit('redeemOpen')
  await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverAsk'))
  return h.link.handoverFrames.find(f => f.type === 'console.handoverAsk')!.payload as never
}

describe('the running Fleet Console @SC-877', () => {
  it('gives hq the lookup of its handover code, never the code, and tells everyone', async () => {
    const [open] = running.link.callsOf('handover.open')
    expect(open.lookup).toBe(await consoleCodeLookup(code))
    expect(running.link.wire()).not.toContain(code)
    expect(running.link.wire()).not.toContain(formatJoinCode(code))
    expect(running.link.callsOf('activity.record').find(c => c.action === 'console.moveStarted')).toMatchObject({ announce: true, byUserId: null })
  })

  it('refuses a handover whose binding does not prove the code, and sends nothing', async () => {
    const intruder = await generateHostKeys('console')
    const fp = await fingerprintOf(intruder.identity)
    await running.ctx.handoverOut.onRequest({
      handoverId: 'ho-1', ask: { identity: intruder.identity, machineName: 'laptop', binding: await newConsoleBinding('ZZZZZZZZZZZZ', fp) },
    })
    expect(running.link.callsOf('handover.accept')).toEqual([])
    expect(running.ctx.handoverOut.refused).toEqual(['bad_binding'])
  })

  it('refuses hq putting its own identity in the new one’s place, even with the new one’s real binding', async () => {
    const real = await askOf(await startNext())
    const hqKeys = await generateHostKeys('console')
    await running.ctx.handoverOut.onRequest({ handoverId: 'ho-1', ask: { ...real, identity: hqKeys.identity } })
    expect(running.link.callsOf('handover.accept')).toEqual([])
    expect(running.ctx.handoverOut.refused).toEqual(['bad_binding'])
  })

  it('answers the new one once, with a certificate the machines follow, sealed to it', async () => {
    const ask = await askOf(await startNext())
    await running.ctx.handoverOut.onRequest({ handoverId: 'ho-1', ask })
    const [accept] = running.link.callsOf('handover.accept') as Accept[]
    expect(accept.handoverId).toBe('ho-1')
    // hq sees no form of the code, and cannot read the machines: they are sealed to the new Fleet Console.
    expect(running.link.wire()).not.toContain(code)
    expect(JSON.stringify(accept)).not.toContain(host.keys.identity.signingKey)
    expect(running.link.callsOf('activity.record').find(c => c.action === 'console.handedOver')).toMatchObject({ announce: true })

    // Spent: the same request again is not answered.
    await running.ctx.handoverOut.onRequest({ handoverId: 'ho-1', ask })
    expect(running.link.callsOf('handover.accept')).toHaveLength(1)
    expect(running.ctx.handoverOut.refused).toEqual(['not_open'])
  })
})

describe('asking the Fleet Console elsewhere for a handover code, from a machine it manages @SC-877', () => {
  /** What the running Fleet Console sent back to `to`, opened as that machine opens it. */
  async function answerTo(to: FakeHost) {
    await until(() => running.link.envelopes.length > 0)
    const opened = await to.open(running.link.envelopes[running.link.envelopes.length - 1])
    if (!opened.ok) throw new Error(`not for ${to.fingerprint}: ${opened.reason}`)
    return opened.message as { kind: string; replyTo: string; answer: { ok: boolean; code?: string; expiresAt?: string; problem?: string } }
  }

  it('answers HQ’s machine with a handover code sealed to it alone: hq is given only its lookup, and everyone is told', async () => {
    await running.ctx.commands.receive(await hqBox.seal({ kind: 'handoverCodeAsk', askId: 'a-1' }))
    const message = await answerTo(hqBox)
    expect(message).toMatchObject({ kind: 'handoverCode', replyTo: 'a-1', answer: { ok: true } })
    const asked = normalizeJoinCode(message.answer.code!)!
    expect(consoleCodeKind(asked)).toBe('handover')
    const opens = running.link.callsOf('handover.open')
    expect(opens).toHaveLength(2)
    expect(opens[1].lookup).toBe(await consoleCodeLookup(asked))
    expect(running.link.wire()).not.toContain(asked)
    expect(running.link.wire()).not.toContain(formatJoinCode(asked))
    const started = running.link.callsOf('activity.record').filter(c => c.action === 'console.moveStarted')
    expect(started[1]).toMatchObject({ announce: true, byUserId: null })
    expect(started[1].subject).toContain('hq-box')
  })

  it('refuses any other machine it manages, makes no code, and says why to that machine only', async () => {
    await running.ctx.commands.receive(await host.seal({ kind: 'handoverCodeAsk', askId: 'a-2' }))
    const message = await answerTo(host)
    expect(message).toMatchObject({ kind: 'handoverCode', replyTo: 'a-2', answer: { ok: false } })
    expect(message.answer.problem).toMatch(/HQ's machine/)
    expect(running.link.callsOf('handover.open')).toHaveLength(1)
    // The code made before still works: a refused ask withdraws nothing.
    const ask = await askOf(await startNext())
    await running.ctx.handoverOut.onRequest({ handoverId: 'ho-1', ask })
    expect(running.link.callsOf('handover.accept')).toHaveLength(1)
  })

  it('ignores an ask that is not from a machine it pinned, such as one hq made', async () => {
    const intruder = await FakeHost.create()
    intruder.consoleIdentity = runningKeys().identity
    await running.ctx.commands.receive(await intruder.seal({ kind: 'handoverCodeAsk', askId: 'a-3' }))
    // Signed as hq's machine but by another key: refused before anything is read.
    await running.ctx.commands.receive({ ...(await intruder.seal({ kind: 'handoverCodeAsk', askId: 'a-4' })), from: hqBox.fingerprint })
    await new Promise(r => setTimeout(r, 20))
    expect(running.link.envelopes).toEqual([])
    expect(running.link.callsOf('handover.open')).toHaveLength(1)
  })
})

describe('the new Fleet Console @SC-877', () => {
  async function honestAnswer(h: Harness): Promise<Accept['acceptance']> {
    await running.ctx.handoverOut.onRequest({ handoverId: 'ho-1', ask: await askOf(h) })
    return (running.link.callsOf('handover.accept') as Accept[])[0].acceptance
  }

  it('takes the machines from the Fleet Console that made the code, and hands hq a certificate they follow', async () => {
    const h = await startNext()
    h.link.emit('handover', await honestAnswer(h))
    await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverDone'))
    // Not moved until hq has given it its credential: nothing pinned yet, and the running one keeps the machines.
    expect(h.ctx.hosts.list()).toEqual([])
    expect(h.ctx.handoverIn.status()).toEqual({ state: 'waiting', fingerprint: h.ctx.consoleFingerprint })
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'handedOver')
    // Each machine comes with its notify setting.
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)).toMatchObject({ hostId: 'h-office', siteName: 'office', executionSiteId: 'es-office', notifyIfSilent: false })
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)).toMatchObject({ hqMachine: true })
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)?.notifyIfSilent).toBeUndefined()
    const { certificate } = h.link.handoverFrames.find(f => f.type === 'console.handoverDone')!.payload as { certificate: unknown }
    const followed = await verifyHandoverCertificate(certificate, runningKeys().identity)
    expect(followed?.fingerprint).toBe(h.ctx.consoleFingerprint)
    expect(h.ctx.handoverIn.status()).toEqual({ state: 'handedOver', from: expect.any(String), hosts: 2, repinned: 0, fingerprint: h.ctx.consoleFingerprint })
    expect(h.link.wire()).not.toContain(code)

    // The machine says it follows the new one now.
    host.consoleIdentity = (h.state.readJson('keys.json') as HostKeys).identity
    await h.ctx.commands.receive(await host.seal({ kind: 'handedOver', previous: await fingerprintOf(runningKeys().identity) }))
    expect(h.ctx.handoverIn.status()).toMatchObject({ state: 'handedOver', hosts: 2, repinned: 1 })
  })

  it('counts each machine that follows it, though it started seconds before and refuses older envelopes as stale', async () => {
    // A real start: every envelope sent in its first moments is refused as possibly replayed (core's replay.ts).
    const h = await startNext(code, new EnvelopeReplayGuard())
    h.link.emit('handover', await honestAnswer(h))
    await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverDone'))
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'handedOver')
    const previous = await fingerprintOf(runningKeys().identity)
    for (const machine of [host, hqBox]) {
      machine.consoleIdentity = (h.state.readJson('keys.json') as HostKeys).identity
      const said = await machine.seal({ kind: 'handedOver', previous })
      h.link.emit('envelope', said)
      // The same words again count once.
      h.link.emit('envelope', said)
    }
    await until(() => h.ctx.handoverIn.status().state === 'handedOver' && (h.ctx.handoverIn.status() as { repinned: number }).repinned === 2)
    expect(h.ctx.handoverIn.status()).toMatchObject({ hosts: 2, repinned: 2 })
  })

  it('counts a machine that said it follows before the move was made done', async () => {
    const h = await startNext(code, new EnvelopeReplayGuard())
    h.link.emit('handover', await honestAnswer(h))
    await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverDone'))
    host.consoleIdentity = (h.state.readJson('keys.json') as HostKeys).identity
    await h.ctx.handoverIn.onFollowing(await host.seal({ kind: 'handedOver', previous: await fingerprintOf(runningKeys().identity) }))
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'handedOver')
    expect(h.ctx.handoverIn.status()).toMatchObject({ hosts: 2, repinned: 1 })
  })

  it('counts no machine that was not handed over, nor any other words', async () => {
    const h = await startNext(code, new EnvelopeReplayGuard())
    h.link.emit('handover', await honestAnswer(h))
    await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverDone'))
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'handedOver')
    const stranger = await FakeHost.create()
    stranger.consoleIdentity = (h.state.readJson('keys.json') as HostKeys).identity
    await h.ctx.handoverIn.onFollowing(await stranger.seal({ kind: 'handedOver', previous: 'x' }))
    host.consoleIdentity = stranger.consoleIdentity
    await h.ctx.handoverIn.onFollowing(await host.seal({ kind: 'handoverCodeAsk', askId: 'a1' }))
    expect(h.ctx.handoverIn.status()).toMatchObject({ hosts: 2, repinned: 0 })
  })

  it('takes nothing from hq standing in for the running Fleet Console', async () => {
    const h = await startNext()
    await askOf(h)
    const hqKeys = await generateHostKeys('console')
    const own = (h.state.readJson('keys.json') as HostKeys).identity
    const intruderHost = await generateHostKeys('host')
    const certificate = await signHandoverCertificate(hqKeys, own, 'laptop')
    const envelope = await sealEnvelope({
      sender: hqKeys, recipient: own,
      message: { kind: 'handoverState', certificate, hosts: [{
        fingerprint: await fingerprintOf(intruderHost.identity), hostId: 'h-x', identity: intruderHost.identity, machineName: 'x',
        siteName: 'x', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: null,
      }] },
    })
    // Without the code, hq can only guess the binding.
    const hqFp = await fingerprintOf(hqKeys.identity)
    h.link.emit('handover', { identity: hqKeys.identity, binding: await oldConsoleBinding('ZZZZZZZZZZZZ', hqFp, await fingerprintOf(own)), envelope })
    await until(() => h.ctx.handoverIn.status().state === 'failed')
    expect(h.ctx.hosts.list()).toEqual([])
    expect(h.link.handoverFrames.map(f => f.type)).toEqual(['console.handoverAsk'])
  })

  it('takes nothing when the running one’s answer is altered on the way', async () => {
    const h = await startNext()
    const answer = await honestAnswer(h)
    h.link.emit('handover', { ...answer, envelope: { ...answer.envelope, ct: answer.envelope.ct.replace(/^./, c => (c === 'A' ? 'B' : 'A')) } })
    await until(() => h.ctx.handoverIn.status().state === 'failed')
    expect(h.ctx.hosts.list()).toEqual([])
  })

  it('takes nothing when hq never completes the move, and the running one keeps the machines', async () => {
    const h = await startNext()
    h.link.emit('handover', await honestAnswer(h))
    await until(() => h.link.handoverFrames.some(f => f.type === 'console.handoverDone'))
    h.link.setState('refused')
    await until(() => h.ctx.handoverIn.status().state === 'failed')
    expect(h.ctx.handoverIn.status()).toMatchObject({ state: 'failed', problem: expect.stringMatching(/did not finish/) })
    expect(h.ctx.hosts.list()).toEqual([])
  })

  it('refuses to start empty when hq answers its handover code as one hq made: the move did not happen', async () => {
    const h = await startNext()
    await askOf(h)
    h.link.emit('notHandedOver')
    expect(h.ctx.handoverIn.status()).toMatchObject({ state: 'failed', problem: expect.stringMatching(/did not happen/) })
    expect(h.ctx.hosts.list()).toEqual([])
  })

  it('with a code hq made, takes no machines even from an answer that proves that code, since hq knows it', async () => {
    const fresh = 'H7QM4XPD93TB'
    const h = await startNext(fresh)
    h.link.emit('redeemOpen')
    const hqKeys = await generateHostKeys('console')
    const own = (h.state.readJson('keys.json') as HostKeys).identity
    const intruderHost = await generateHostKeys('host')
    const certificate = await signHandoverCertificate(hqKeys, own, 'laptop')
    const envelope = await sealEnvelope({
      sender: hqKeys, recipient: own,
      message: { kind: 'handoverState', certificate, hosts: [{
        fingerprint: await fingerprintOf(intruderHost.identity), hostId: 'h-x', identity: intruderHost.identity, machineName: 'x',
        siteName: 'x', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: null,
      }] },
    })
    const binding = await oldConsoleBinding(fresh, await fingerprintOf(hqKeys.identity), await fingerprintOf(own))
    await h.ctx.handoverIn.onAcceptance({ identity: hqKeys.identity, binding, envelope })
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'fresh')
    expect(h.ctx.hosts.list()).toEqual([])
    expect(h.link.handoverFrames).toEqual([])
    expect(h.ctx.handoverIn.status()).toEqual({ state: 'fresh', fingerprint: h.ctx.consoleFingerprint })
  })

  it('says it started with no machines when hq’s own code gave it a credential at once', async () => {
    const h = await startNext('H7QM4XPD93TB')
    h.link.setState('connected')
    await until(() => h.ctx.handoverIn.status().state === 'fresh')
    expect(h.ctx.handoverIn.status()).toEqual({ state: 'fresh', fingerprint: h.ctx.consoleFingerprint })
    expect(h.ctx.hosts.list()).toEqual([])
  })
})
