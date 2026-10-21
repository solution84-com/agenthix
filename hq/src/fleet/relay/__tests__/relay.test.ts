/**
 * hq's relay (host-management spec §4 C3, C8): envelopes pass between a host service and the Fleet Console it pinned,
 * unchanged and unread; anything else is refused; a disconnected host's link closes at once.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
  EnvelopeReplayGuard, fingerprintOf, generateHostKeys, openEnvelope, sealEnvelope, type HostKeys,
} from '@agenthix/core/host-crypto'
import { HOST_RELAY_MAX_FRAME_BYTES, HOST_PROTOCOL_VERSION, type HostEnvelope, type HostMessage } from '@agenthix/core'
import { hostLink, consoleLink, opened, refusedWith, sendFrame, startHarness, type Harness } from './relayHarness'

let fleetConsole: HostKeys
let host: HostKeys
let other: HostKeys
let fp: { console: string; host: string; other: string }
const message: HostMessage = { kind: 'result', replyTo: 'r1', result: { op: 'figures.read', ok: true } as never }

beforeAll(async () => {
  fleetConsole = await generateHostKeys('console')
  host = await generateHostKeys('host')
  other = await generateHostKeys('host')
  fp = { console: await fingerprintOf(fleetConsole.identity), host: await fingerprintOf(host.identity), other: await fingerprintOf(other.identity) }
})

let h: Harness
beforeEach(async () => {
  h = await startHarness()
  h.hosts.set('cred-host', { hostId: 'h1', fingerprint: fp.host, consoleFingerprint: fp.console })
  h.hosts.set('cred-other', { hostId: 'h2', fingerprint: fp.other, consoleFingerprint: fp.console })
})
afterEach(() => h.close())

async function connectBoth() {
  const m = consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })
  await opened(m)
  const hc = hostLink(h, { Authorization: 'Bearer cred-host' })
  await opened(hc)
  await m.next('host.presence')
  return { m, hc }
}

describe('a host service’s envelope @SC-923', () => {
  it('reaches the Fleet Console byte for byte, and the Fleet Console can open it', async () => {
    const { m, hc } = await connectBoth()
    const envelope = await sealEnvelope({ sender: host, recipient: fleetConsole.identity, message })
    sendFrame(hc, 'relay.envelope', { envelope })
    const got = (await m.next('relay.envelope')).payload as { envelope: HostEnvelope }
    expect(JSON.stringify(got.envelope)).toBe(JSON.stringify(envelope))
    const opened = await openEnvelope(got.envelope, {
      recipient: fleetConsole, pinned: f => (f === fp.host ? host.identity : null), replay: new EnvelopeReplayGuard(Date.now() - 60_000),
    })
    expect(opened).toMatchObject({ ok: true, message })
  })

  it('is passed without being opened: a ciphertext nobody could open still arrives exactly as sent', async () => {
    const { m, hc } = await connectBoth()
    const envelope = await sealEnvelope({ sender: host, recipient: fleetConsole.identity, message })
    const garbled = { ...envelope, ct: 'A'.repeat(envelope.ct.length) }
    sendFrame(hc, 'relay.envelope', { envelope: garbled })
    expect(((await m.next('relay.envelope')).payload as { envelope: HostEnvelope }).envelope).toEqual(garbled)
  })

  it('is refused when it claims another sender, or goes anywhere but its own Fleet Console', async () => {
    const { m, hc } = await connectBoth()
    const asOther = await sealEnvelope({ sender: other, recipient: fleetConsole.identity, message })
    sendFrame(hc, 'relay.envelope', { envelope: asOther })
    expect((await hc.next('relay.undeliverable')).payload).toEqual({ envelopeId: asOther.id, reason: 'not_allowed' })
    const toOtherHost = await sealEnvelope({ sender: host, recipient: other.identity, message })
    sendFrame(hc, 'relay.envelope', { envelope: toOtherHost })
    expect((await hc.next('relay.undeliverable')).payload).toEqual({ envelopeId: toOtherHost.id, reason: 'not_allowed' })
    expect(m.frames.filter(f => f.type === 'relay.envelope')).toEqual([])
  })

  it('is refused when it is larger than the relay passes, or is not an envelope', async () => {
    const { m, hc } = await connectBoth()
    const envelope = await sealEnvelope({ sender: host, recipient: fleetConsole.identity, message })
    sendFrame(hc, 'relay.envelope', { envelope: { ...envelope, ct: 'A'.repeat(HOST_RELAY_MAX_FRAME_BYTES) } })
    expect((await hc.next('relay.undeliverable')).payload).toEqual({ envelopeId: envelope.id, reason: 'too_large' })
    sendFrame(hc, 'relay.envelope', { envelope: { ...envelope, from: 'not-a-fingerprint' } })
    expect((await hc.next('relay.undeliverable')).payload).toEqual({ envelopeId: envelope.id, reason: 'malformed' })
    expect(m.frames.filter(f => f.type === 'relay.envelope')).toEqual([])
  })

  it('is answered recipient_offline while no Fleet Console is connected', async () => {
    const hc = hostLink(h, { Authorization: 'Bearer cred-host' })
    await opened(hc)
    const envelope = await sealEnvelope({ sender: host, recipient: fleetConsole.identity, message })
    sendFrame(hc, 'relay.envelope', { envelope })
    expect((await hc.next('relay.undeliverable')).payload).toEqual({ envelopeId: envelope.id, reason: 'recipient_offline' })
  })
})

describe('the Fleet Console’s envelope @SC-923', () => {
  it('reaches the host it is sealed to, and no other', async () => {
    const { m, hc } = await connectBoth()
    const oc = hostLink(h, { Authorization: 'Bearer cred-other' })
    await opened(oc)
    const envelope = await sealEnvelope({ sender: fleetConsole, recipient: host.identity, message })
    sendFrame(m, 'relay.envelope', { envelope })
    expect(((await hc.next('relay.envelope')).payload as { envelope: HostEnvelope }).envelope).toEqual(envelope)
    expect(oc.frames.filter(f => f.type === 'relay.envelope')).toEqual([])
  })

  it('is refused to an unknown machine, to one offline, and from a key the machine did not pin', async () => {
    const m = consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })
    await opened(m)
    const stranger = await generateHostKeys('host')
    const toStranger = await sealEnvelope({ sender: fleetConsole, recipient: stranger.identity, message })
    sendFrame(m, 'relay.envelope', { envelope: toStranger })
    expect((await m.next('relay.undeliverable')).payload).toEqual({ envelopeId: toStranger.id, reason: 'unknown_recipient' })
    const toOffline = await sealEnvelope({ sender: fleetConsole, recipient: host.identity, message })
    sendFrame(m, 'relay.envelope', { envelope: toOffline })
    expect((await m.next('relay.undeliverable')).payload).toEqual({ envelopeId: toOffline.id, reason: 'recipient_offline' })
    const impostor = await generateHostKeys('console')
    const forged = await sealEnvelope({ sender: impostor, recipient: host.identity, message })
    sendFrame(m, 'relay.envelope', { envelope: forged })
    expect((await m.next('relay.undeliverable')).payload).toEqual({ envelopeId: forged.id, reason: 'not_allowed' })
  })
})

describe('the host link @SC-923', () => {
  it('refuses a wrong credential, and no credential', async () => {
    expect(await refusedWith(hostLink(h, { Authorization: 'Bearer wrong' }))).toBe(401)
    expect(await refusedWith(hostLink(h, {}))).toBe(401)
  })

  it('refuses a version two or more majors apart, or one that is not a version @SC-1129', async () => {
    const major = Number(HOST_PROTOCOL_VERSION.split('.')[0])
    for (const version of [`${major + 2}.0`, `${major + 5}.1`, 'two']) {
      expect(await refusedWith(hostLink(h, { Authorization: 'Bearer cred-host', 'X-Host-Protocol-Version': version }))).toBe(426)
    }
  })

  it('accepts a version one major ahead, and no version at all @SC-1129', async () => {
    const major = Number(HOST_PROTOCOL_VERSION.split('.')[0])
    for (const headers of [{ 'X-Host-Protocol-Version': `${major + 1}.0` }, {}] as Record<string, string>[]) {
      const hc = hostLink(h, { Authorization: 'Bearer cred-host', ...headers })
      await opened(hc)
      hc.ws.close()
      await hc.closed
    }
  })

  it('closes a disconnected host’s link at once, telling it so, and the Fleet Console sees it go', async () => {
    const { m, hc } = await connectBoth()
    h.hosts.delete('cred-host')
    expect(h.hub.revokeHost('h1')).toBe(true)
    await hc.next('revoke')
    expect(await hc.closed).toBe(4003)
    expect((await m.next('host.presence')).payload).toMatchObject({ hostId: 'h1', online: false })
    expect(await refusedWith(hostLink(h, { Authorization: 'Bearer cred-host' }))).toBe(401)
  })
})

describe('hq’s relay code @SC-923', () => {
  it('never opens, seals or holds a key: none of it imports the envelope cryptography', () => {
    const dir = path.resolve(__dirname, '..')
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
      const source = readFileSync(path.join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/openEnvelope|sealEnvelope|PrivateKey|EnvelopeReplayGuard/)
    }
  })
})
