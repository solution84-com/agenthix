/**
 * The Fleet Console moving (host-management spec §7), hq's part: a new Fleet Console presenting a handover lookup is
 * not the console until the move is done; its half goes to the running one and the answer back, unread; when it is
 * done the running one is retired and every machine is routed to the new one and handed the certificate.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  fingerprintOf, generateHostKeys, newConsoleBinding, sealEnvelope, signHandoverCertificate, type HostKeys,
} from '@agenthix/core/host-crypto'
import type { ConsoleHandoverAsk, ConsoleHandoverCertificate } from '@agenthix/core'
import { RelayHub } from '../relayHub'
import { hostLink, consoleLink, opened, refusedWith, sendFrame, startHarness, type Harness } from './relayHarness'

const CODE = 'K7QM4XPD93TB'
const LOOKUP = 'b'.repeat(64)

let oldKeys: HostKeys
let newKeys: HostKeys
let host: HostKeys
let fp: { old: string; new: string; host: string }
let certificate: ConsoleHandoverCertificate

beforeAll(async () => {
  oldKeys = await generateHostKeys('console')
  newKeys = await generateHostKeys('console')
  host = await generateHostKeys('host')
  fp = { old: await fingerprintOf(oldKeys.identity), new: await fingerprintOf(newKeys.identity), host: await fingerprintOf(host.identity) }
  certificate = await signHandoverCertificate(oldKeys, newKeys.identity, 'laptop')
})

let h: Harness
beforeEach(async () => {
  h = await startHarness()
  h.hosts.set('cred-host', { hostId: 'h1', fingerprint: fp.host, consoleFingerprint: fp.old })
  h.handovers.set(LOOKUP, { handoverId: 'ho-1', expiresAt: new Date(Date.now() + 60_000) })
})
afterEach(() => h.close())

async function ask(): Promise<ConsoleHandoverAsk> {
  const identity = { role: 'console' as const, signingKey: newKeys.identity.signingKey, sealingKey: newKeys.identity.sealingKey }
  return { identity, machineName: 'laptop', binding: await newConsoleBinding(CODE, fp.new) }
}

async function start() {
  const running = consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })
  await opened(running)
  const hc = hostLink(h, { Authorization: 'Bearer cred-host' })
  await opened(hc)
  await running.next('host.presence')
  const next = consoleLink(h, { 'X-Console-Code': LOOKUP })
  await opened(next)
  return { running, hc, next }
}

describe('a new Fleet Console with a handover lookup @SC-937', () => {
  it('is refused without a lookup hq knows, and the code itself is never a lookup', async () => {
    const m = consoleLink(h, { 'X-Console-Code': 'c'.repeat(64) })
    await expect(opened(m)).rejects.toThrow('401')
    await expect(opened(consoleLink(h, { 'X-Console-Code': 'K7QM-4XPD-93TB' }))).rejects.toThrow('401')
  })

  it('has its half passed to the running Fleet Console, and stays out of the console link meanwhile', async () => {
    const { running, next } = await start()
    sendFrame(next, 'console.handoverAsk', await ask())
    const request = await running.next('console.handoverRequest')
    expect(request.payload).toEqual({ handoverId: 'ho-1', ask: await ask() })
    expect(h.asks).toEqual([{ handoverId: 'ho-1', fingerprint: fp.new }])
    // It is not the console: no request is answered and no envelope relayed for it, and the running one stays.
    sendFrame(next, 'console.request', { method: 'host.list', params: {} }, { requestId: 'r1' })
    const envelope = await sealEnvelope({ sender: newKeys, recipient: host.identity, message: { kind: 'figures', figures: {} as never } })
    sendFrame(next, 'relay.envelope', { envelope })
    await new Promise(r => setTimeout(r, 50))
    expect(next.frames.map(f => f.type)).not.toContain('console.response')
    expect(next.frames.map(f => f.type)).not.toContain('relay.undeliverable')
    expect(h.hub.isConsoleConnected()).toBe(true)
  })

  it('is closed when its half is not one', async () => {
    const { next } = await start()
    sendFrame(next, 'console.handoverAsk', { ...(await ask()), identity: host.identity })
    expect(await next.closed).toBe(4004)
  })

  const done = { oldFingerprint: '', newFingerprint: '', certificate: null as unknown as ConsoleHandoverCertificate }
  function completable(): void {
    Object.assign(done, { oldFingerprint: fp.old, newFingerprint: fp.new, certificate })
    let issued = false
    let completed = false
    h.issueHandoverCredential = async (_id, cert) => {
      if (JSON.stringify(cert) !== JSON.stringify(certificate)) return null
      issued = true
      return 'fcc_new'
    }
    h.completeHandover = async () => (issued && !completed ? (completed = true, done) : null)
    h.completeHandoverWithCredential = async presented =>
      presented === 'fcc_new' && issued && !completed ? (completed = true, { ...done, handoverId: 'ho-1' }) : null
  }

  it('keeps the running Fleet Console until the new one acknowledges its credential', async () => {
    const { running, hc, next } = await start()
    sendFrame(next, 'console.handoverAsk', await ask())
    await running.next('console.handoverRequest')
    completable()
    sendFrame(next, 'console.handoverDone', { certificate })
    expect((await next.next('console.credential')).payload).toEqual({ credential: 'fcc_new' })
    await new Promise(r => setTimeout(r, 50))
    expect(running.ws.readyState).toBe(running.ws.OPEN)
    expect(hc.frames.map(f => f.type)).not.toContain('console.handover')
    // Its connection drops before it says it kept the credential: the running one stays the Fleet Console.
    next.ws.close()
    await next.closed
    await new Promise(r => setTimeout(r, 50))
    expect(running.ws.readyState).toBe(running.ws.OPEN)
    expect(h.hub.isConsoleConnected()).toBe(true)
  })

  it('completes the move when a new one that dropped before acknowledging presents its credential', async () => {
    const { running, hc, next } = await start()
    sendFrame(next, 'console.handoverAsk', await ask())
    await running.next('console.handoverRequest')
    completable()
    sendFrame(next, 'console.handoverDone', { certificate })
    await next.next('console.credential')
    next.ws.close()
    await next.closed
    const again = consoleLink(h, { Authorization: 'Bearer fcc_new' })
    await opened(again)
    expect(await running.closed).toBe(4001)
    expect((await hc.next('console.handover')).payload).toEqual({ certificates: [certificate] })
    const toNew = await sealEnvelope({ sender: host, recipient: newKeys.identity, message: { kind: 'handedOver', previous: fp.old } })
    sendFrame(hc, 'relay.envelope', { envelope: toNew })
    expect(((await again.next('relay.envelope')).payload as { envelope: { id: string } }).envelope.id).toBe(toNew.id)
  })

  it('refuses a credential that completes no move', async () => {
    expect(await refusedWith(consoleLink(h, { Authorization: 'Bearer fcc_new' }))).toBe(401)
  })

  it('becomes the Fleet Console once done: the one before is retired, and machines are routed to it and handed the certificate', async () => {
    const { running, hc, next } = await start()
    sendFrame(next, 'console.handoverAsk', await ask())
    await running.next('console.handoverRequest')
    completable()
    sendFrame(next, 'console.handoverDone', { certificate })
    expect((await next.next('console.credential')).payload).toEqual({ credential: 'fcc_new' })
    sendFrame(next, 'console.handoverAck', {})
    // Whatever it sends straight after waits for the move, rather than being dropped.
    sendFrame(next, 'console.request', { method: 'host.list', params: {} }, { requestId: 'r-after' })
    expect(await running.closed).toBe(4001)
    expect((await next.next('console.response')).replyTo).toBe('r-after')
    expect((await hc.next('console.handover')).payload).toEqual({ certificates: [certificate] })

    // The host's envelopes now go to the new Fleet Console, and nowhere else.
    const toNew = await sealEnvelope({ sender: host, recipient: newKeys.identity, message: { kind: 'handedOver', previous: fp.old } })
    sendFrame(hc, 'relay.envelope', { envelope: toNew })
    expect(((await next.next('relay.envelope')).payload as { envelope: { id: string } }).envelope.id).toBe(toNew.id)
    const toOld = await sealEnvelope({ sender: host, recipient: oldKeys.identity, message: { kind: 'handedOver', previous: fp.old } })
    sendFrame(hc, 'relay.envelope', { envelope: toOld })
    expect((await hc.next('relay.undeliverable')).payload).toMatchObject({ envelopeId: toOld.id, reason: 'not_allowed' })
  })

  it('stays out when hq does not accept what it says it holds', async () => {
    const { running, next } = await start()
    sendFrame(next, 'console.handoverAsk', await ask())
    await running.next('console.handoverRequest')
    sendFrame(next, 'console.handoverDone', { certificate })
    expect(await next.closed).toBe(4004)
    expect(h.hub.isConsoleConnected()).toBe(true)
  })
})

describe('a machine connecting after a move @SC-937', () => {
  it('is handed every certificate hq holds', async () => {
    h.certificates = [certificate]
    const hc = hostLink(h, { Authorization: 'Bearer cred-host' })
    await opened(hc)
    expect((await hc.next('console.handover')).payload).toEqual({ certificates: [certificate] })
  })
})

describe('the hub @SC-937', () => {
  it('passes the running Fleet Console’s answer only to a new one that asked, once', async () => {
    const hub = new RelayHub({ knownHost: async () => null })
    const sent: string[] = []
    const ws = { readyState: 1, OPEN: 1, send: (t: string) => sent.push(t), close: () => {} } as never
    hub.addHandover('ho-1', ws, () => {})
    const acceptance = { identity: oldKeys.identity as never, binding: 'x'.repeat(43), envelope: {} as never }
    expect(hub.passHandover('ho-1', acceptance)).toBe(false)
    hub.setHandoverAsk('ho-1', await ask())
    expect(hub.passHandover('ho-1', acceptance)).toBe(true)
    expect(hub.passHandover('ho-1', acceptance)).toBe(false)
    expect(sent.map(t => JSON.parse(t).type)).toEqual(['console.handover'])
  })
})
