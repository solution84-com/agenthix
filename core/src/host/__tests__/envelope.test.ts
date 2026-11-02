import { beforeAll, describe, expect, it } from 'vitest'
import {
  EnvelopeReplayGuard, fingerprintOf, generateHostKeys, openEnvelope, sealEnvelope, toBase64url, fromBase64url,
  type HostKeys,
} from '../crypto/index.js'
import {
  HOST_ENVELOPE_CLOCK_SKEW_MS, HOST_ENVELOPE_MAX_LIFETIME_MS, formatFingerprint, type HostEnvelope, type HostIdentity,
  type HostMessage,
} from '../envelope.js'
import * as root from '../../index.js'

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0)
const message: HostMessage = {
  kind: 'request', requestId: 'r1', by: { kind: 'fleetAdmin', userId: 'u1', name: 'Sam' }, request: { op: 'figures.read' },
}

let fleetConsole: HostKeys
let host: HostKeys
let other: HostKeys
let pins: Map<string, HostIdentity>

beforeAll(async () => {
  fleetConsole = await generateHostKeys('console')
  host = await generateHostKeys('host')
  other = await generateHostKeys('host')
  pins = new Map([[await fingerprintOf(fleetConsole.identity), fleetConsole.identity]])
})

/** A guard that began well before T0, so the restart floor is not in play unless a test asks for it. */
const guard = () => new EnvelopeReplayGuard(T0 - 60 * 60_000)
const seal = (now = T0, lifetimeMs?: number) => sealEnvelope({ sender: fleetConsole, recipient: host.identity, message, now, lifetimeMs })
const open = (env: unknown, opts: { now?: number; replay?: EnvelopeReplayGuard; as?: HostKeys } = {}) =>
  openEnvelope(env, { recipient: opts.as ?? host, pinned: (fp) => pins.get(fp) ?? null, replay: opts.replay ?? guard(), now: opts.now ?? T0 })

/** Flips one bit of a base64url field, keeping it valid base64url of the same length. */
function flip(value: string): string {
  const bytes = fromBase64url(value)!
  bytes[0] ^= 1
  return toBase64url(bytes)
}

describe('the host envelope', () => {
  it('opens what was sealed to it, from a pinned sender', async () => {
    const env = await seal()
    const opened = await open(env)
    expect(opened).toMatchObject({ ok: true, fromFingerprint: await fingerprintOf(fleetConsole.identity), message })
  })

  it('carries nothing readable on the wire', async () => {
    const env = await seal()
    expect(JSON.stringify(env)).not.toContain('figures.read')
    expect(JSON.stringify(env)).not.toContain('Sam')
  })

  it('cannot be read by anyone it was not sealed to, even with the header rewritten for them', async () => {
    const env = await seal()
    expect(await open(env, { as: other })).toMatchObject({ ok: false, reason: 'wrong_recipient' })
    const readdressed = { ...env, to: await fingerprintOf(other.identity) }
    expect(await open(readdressed, { as: other })).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('refuses any change to its header or ciphertext', async () => {
    const env = await seal()
    const tampered: Partial<HostEnvelope>[] = [
      { ct: flip(env.ct) }, { iv: flip(env.iv) }, { epk: flip(env.epk) }, { id: flip(env.id) },
      { sentAt: env.sentAt - 1 }, { expiresAt: env.expiresAt - 1 }, { sig: flip(env.sig) },
    ]
    for (const change of tampered) {
      expect(await open({ ...env, ...change }), JSON.stringify(Object.keys(change))).toMatchObject({ ok: false, reason: 'bad_signature' })
    }
  })

  it('cannot be made up by a relay that holds only public keys', async () => {
    const forger = await generateHostKeys('console')
    const forged = await sealEnvelope({ sender: forger, recipient: host.identity, message, now: T0 })
    expect(await open(forged)).toMatchObject({ ok: false, reason: 'unknown_sender' })
    const claimed = { ...forged, from: await fingerprintOf(fleetConsole.identity) }
    expect(await open(claimed)).toMatchObject({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a replay, also when two copies arrive at once', async () => {
    const env = await seal()
    const replay = guard()
    expect((await open(env, { replay })).ok).toBe(true)
    expect(await open(env, { replay })).toMatchObject({ ok: false, reason: 'replayed' })
    const twice = await seal()
    const both = await Promise.all([open(twice, { replay }), open(twice, { replay })])
    expect(both.filter((r) => r.ok)).toHaveLength(1)
  })

  it('refuses one sent before its recipient last started, within the clock skew', async () => {
    const env = await seal(T0)
    const restarted = new EnvelopeReplayGuard(T0 - HOST_ENVELOPE_CLOCK_SKEW_MS + 1)
    expect(await open(env, { replay: restarted, now: T0 + 1000 })).toMatchObject({ ok: false, reason: 'stale' })
    const later = await seal(T0 + HOST_ENVELOPE_CLOCK_SKEW_MS)
    expect((await open(later, { replay: restarted, now: T0 + HOST_ENVELOPE_CLOCK_SKEW_MS })).ok).toBe(true)
  })

  describe('an answer to what the recipient asked since it started', () => {
    const answer = { kind: 'result', replyTo: 'asked-after-start', result: { ok: true, op: 'figures.read', result: {} } }
    const sealAnswer = (now: number, m: unknown = answer) =>
      sealEnvelope({ sender: fleetConsole, recipient: host.identity, message: m as HostMessage, now })
    const awaited = (m: unknown) => (m as { replyTo?: unknown } | null)?.replyTo === 'asked-after-start'
    const justStarted = () => new EnvelopeReplayGuard(T0)
    const openIn = (env: unknown, replay: EnvelopeReplayGuard, now = T0 + 2000) =>
      openEnvelope(env, { recipient: host, pinned: (fp) => pins.get(fp) ?? null, replay, now, awaited })

    it('is accepted at once inside the start window, fresh and correctly signed', async () => {
      const replay = justStarted()
      expect(await openIn(await sealAnswer(T0 + 1000), replay)).toMatchObject({ ok: true, message: answer })
    })

    it('is still refused when replayed', async () => {
      const replay = justStarted()
      const env = await sealAnswer(T0 + 1000)
      expect((await openIn(env, replay)).ok).toBe(true)
      expect(await openIn(env, replay)).toMatchObject({ ok: false, reason: 'replayed' })
      const twice = await sealAnswer(T0 + 1000)
      const both = await Promise.all([openIn(twice, replay), openIn(twice, replay)])
      expect(both.filter((r) => r.ok)).toHaveLength(1)
    })

    it('does not let through, inside the start window, what is not awaited: a copy from before the restart names nothing asked since', async () => {
      const replay = justStarted()
      const old = await sealAnswer(T0 - 1000, { ...answer, replyTo: 'asked-before-restart' })
      expect(await openIn(old, replay)).toMatchObject({ ok: false, reason: 'stale' })
      expect(await openIn(await sealEnvelope({ sender: fleetConsole, recipient: host.identity, message, now: T0 + 1000 }), replay))
        .toMatchObject({ ok: false, reason: 'stale' })
      expect(await openEnvelope(await sealAnswer(T0 + 1000), { recipient: host, pinned: (fp) => pins.get(fp) ?? null, replay, now: T0 + 2000 }))
        .toMatchObject({ ok: false, reason: 'stale' })
    })

    it('is refused when old, however it is awaited', async () => {
      const old = await sealAnswer(T0 - HOST_ENVELOPE_MAX_LIFETIME_MS)
      expect(await openIn(old, justStarted(), T0 + 1000)).toMatchObject({ ok: false, reason: 'expired' })
    })
  })

  it('refuses one that has expired, is from the future, or lives too long', async () => {
    const env = await seal(T0, 60_000)
    expect(await open(env, { now: T0 + 60_000 })).toMatchObject({ ok: false, reason: 'expired' })
    expect(await open(env, { now: T0 - HOST_ENVELOPE_CLOCK_SKEW_MS - 1 })).toMatchObject({ ok: false, reason: 'not_yet_valid' })
    const capped = await seal(T0, 24 * 60 * 60_000)
    expect(capped.expiresAt - capped.sentAt).toBe(HOST_ENVELOPE_MAX_LIFETIME_MS)
  })

  it('refuses what is not an envelope, or a version it does not speak', async () => {
    expect(await open(null)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(await open({ ...(await seal()), from: 'abc' })).toMatchObject({ ok: false, reason: 'malformed' })
    expect(await open({ ...(await seal()), v: 2 })).toMatchObject({ ok: false, reason: 'unsupported_version' })
  })
})

describe('fingerprints', () => {
  it('name both keys and the role, and show as four groups for comparing by eye', async () => {
    const fp = await fingerprintOf(host.identity)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    expect(await fingerprintOf({ ...host.identity, sealingKey: other.identity.sealingKey })).not.toBe(fp)
    expect(await fingerprintOf({ ...host.identity, role: 'console' })).not.toBe(fp)
    expect(formatFingerprint(fp)).toMatch(/^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/)
  })
})

describe('the root entry', () => {
  it('carries no cryptography, so a browser bundle never reaches it', () => {
    expect('sealEnvelope' in root).toBe(false)
    expect('openEnvelope' in root).toBe(false)
    expect('parseHostEnvelope' in root).toBe(true)
  })
})
