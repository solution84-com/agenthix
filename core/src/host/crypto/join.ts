/**
 * The one-time code's derivations (see ../join.ts). Two independent values come from the code: a lookup, which hq is
 * given to admit the joining machine, and a binding key, which hq never sees. Each side MACs its own fingerprint (the
 * Fleet Console also the machine's) under the binding key, so a party that knows only the lookup — hq — can neither
 * make a binding nor learn the key from one.
 */
import {
  JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, CONSOLE_FRESH_CODE_MARK, normalizeJoinCode, parseHandoverCertificate,
  type ConsoleCodeKind, type ConsoleHandoverCertificate,
} from '../join.js'
import type { HostIdentity } from '../envelope.js'
import { fingerprintOf, importSigningPrivateKey, importSigningPublicKey, isHostIdentity, type HostKeys } from './keys.js'
import { canonical, fromBase64url, hkdf, hmac, hmacMatches, randomBytes, subtle, toBase64url, toHex, utf8 } from './webCrypto.js'

const LABEL = 'host-join/1'
const SALT = utf8(LABEL)

export function generateJoinCode(): string {
  // 256 is a multiple of 32, so taking each byte modulo the alphabet's length is uniform.
  return [...randomBytes(JOIN_CODE_LENGTH)].map((b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join('')
}

/** A Fleet Console's one-time code of the given kind (../join.ts says how the first character tells them apart). */
export function generateConsoleCode(kind: ConsoleCodeKind): string {
  const rest = generateJoinCode().slice(1)
  if (kind === 'fresh') return CONSOLE_FRESH_CODE_MARK + rest
  // Any first character but the mark, uniformly: a byte is drawn again when it lands on the mark.
  for (;;) {
    const first = JOIN_CODE_ALPHABET[randomBytes(1)[0] % JOIN_CODE_ALPHABET.length]
    if (first !== CONSOLE_FRESH_CODE_MARK) return first + rest
  }
}

function canonicalCode(code: string): string {
  const c = normalizeJoinCode(code)
  if (!c) throw new Error('Not a join code')
  return c
}

/** What hq is given, and what the joining machine presents: 64 hex digits. */
export async function joinLookup(code: string): Promise<string> {
  return toHex(await hkdf(utf8(canonicalCode(code)), SALT, utf8(`${LABEL}/lookup`)))
}

async function bindingKey(code: string): Promise<Uint8Array> {
  return hkdf(utf8(canonicalCode(code)), SALT, utf8(`${LABEL}/bind`))
}

/**
 * What the joining machine says of itself under its binding, so hq, which relays the join without the code, can neither
 * add it nor drop it, nor change it: `runsHq`, that its host service runs hq; `restores`, the backup it restores a lost
 * site from (see ../join.ts).
 */
export type HostJoinClaims = { runsHq?: true; restores?: { siteName: string; takenAt: string } }

const hostInput = (hostFingerprint: string, claims: HostJoinClaims) =>
  canonical([
    `${LABEL}/host`, hostFingerprint,
    ...(claims.runsHq ? ['runs-hq'] : []),
    ...(claims.restores ? ['restores', claims.restores.siteName, claims.restores.takenAt] : []),
  ])
const consoleInput = (consoleFingerprint: string, hostFingerprint: string) =>
  canonical([`${LABEL}/console`, consoleFingerprint, hostFingerprint])

/** The joining machine's binding over its own fingerprint, and what it claims. */
export async function hostJoinBinding(code: string, hostFingerprint: string, claims: HostJoinClaims = {}): Promise<string> {
  return toBase64url(await hmac(await bindingKey(code), hostInput(hostFingerprint, claims)))
}

/** The Fleet Console's binding over its fingerprint and the machine's it confirmed. */
export async function consoleJoinBinding(code: string, consoleFingerprint: string, hostFingerprint: string): Promise<string> {
  return toBase64url(await hmac(await bindingKey(code), consoleInput(consoleFingerprint, hostFingerprint)))
}

async function matches(code: string, input: Uint8Array, binding: string): Promise<boolean> {
  const mac = fromBase64url(binding)
  if (!mac || mac.length !== 32 || !normalizeJoinCode(code)) return false
  return hmacMatches(await bindingKey(code), input, mac)
}

export function verifyHostJoinBinding(code: string, hostFingerprint: string, binding: string, claims: HostJoinClaims = {}): Promise<boolean> {
  return matches(code, hostInput(hostFingerprint, claims), binding)
}

export function verifyConsoleJoinBinding(
  code: string, consoleFingerprint: string, hostFingerprint: string, binding: string,
): Promise<boolean> {
  return matches(code, consoleInput(consoleFingerprint, hostFingerprint), binding)
}

// ── Enrolling with Cloud (../join.ts) ──
// The same derivations under a label of the `cloud` role, so a Cloud code's lookup and bindings can never be taken for
// a Fleet Console join's, nor a join's for these. Cloud's binding names its role beside its fingerprint, and both
// bindings carry the machine id Cloud gave the machine, so nothing between the two can swap it.

const CLOUD = `${LABEL}/cloud`
const CLOUD_SALT = utf8(CLOUD)

/** What the host service presents to Cloud for its enrolment code: 64 hex digits. */
export async function cloudJoinLookup(code: string): Promise<string> {
  return toHex(await hkdf(utf8(canonicalCode(code)), CLOUD_SALT, utf8(`${CLOUD}/lookup`)))
}

async function cloudKey(code: string): Promise<Uint8Array> {
  return hkdf(utf8(canonicalCode(code)), CLOUD_SALT, utf8(`${CLOUD}/bind`))
}

const hostCloudInput = (hostFingerprint: string, machineId: string) => canonical([`${CLOUD}/host`, 'host', hostFingerprint, machineId])
const cloudInput = (cloudFingerprint: string, hostFingerprint: string, machineId: string) =>
  canonical([`${CLOUD}/controller`, 'cloud', cloudFingerprint, hostFingerprint, machineId])

async function cloudMatches(code: string, input: Uint8Array, binding: string): Promise<boolean> {
  const mac = fromBase64url(binding)
  if (!mac || mac.length !== 32 || !normalizeJoinCode(code)) return false
  return hmacMatches(await cloudKey(code), input, mac)
}

/** The enrolling machine's binding over its own fingerprint and the machine id it was given, if any. */
export async function hostCloudJoinBinding(code: string, hostFingerprint: string, machineId = ''): Promise<string> {
  return toBase64url(await hmac(await cloudKey(code), hostCloudInput(hostFingerprint, machineId)))
}

export function verifyHostCloudJoinBinding(code: string, hostFingerprint: string, binding: string, machineId = ''): Promise<boolean> {
  return cloudMatches(code, hostCloudInput(hostFingerprint, machineId), binding)
}

/** Cloud's binding over its fingerprint, the machine's, and the machine id it answers with. */
export async function cloudJoinBinding(code: string, cloudFingerprint: string, hostFingerprint: string, machineId: string): Promise<string> {
  return toBase64url(await hmac(await cloudKey(code), cloudInput(cloudFingerprint, hostFingerprint, machineId)))
}

export function verifyCloudJoinBinding(
  code: string, cloudFingerprint: string, hostFingerprint: string, machineId: string, binding: string,
): Promise<boolean> {
  return cloudMatches(code, cloudInput(cloudFingerprint, hostFingerprint, machineId), binding)
}

// ── Moving the Fleet Console (../join.ts) ──
// Its own label, so a handover code's lookup and bindings can never be taken for a join's, nor a join's for these.

const HANDOVER = 'console-handover/1'
const HANDOVER_SALT = utf8(HANDOVER)

/**
 * What a new Fleet Console presents to hq for its one-time code — a handover code from the running Fleet Console, or a
 * code hq made itself when none runs — so that it never sends the code: 64 hex digits.
 */
export async function consoleCodeLookup(code: string): Promise<string> {
  return toHex(await hkdf(utf8(canonicalCode(code)), HANDOVER_SALT, utf8(`${HANDOVER}/lookup`)))
}

async function handoverKey(code: string): Promise<Uint8Array> {
  return hkdf(utf8(canonicalCode(code)), HANDOVER_SALT, utf8(`${HANDOVER}/bind`))
}

const newInput = (newFingerprint: string) => canonical([`${HANDOVER}/new`, newFingerprint])
const oldInput = (oldFingerprint: string, newFingerprint: string) => canonical([`${HANDOVER}/old`, oldFingerprint, newFingerprint])

/** The new Fleet Console's binding over its own fingerprint. */
export async function newConsoleBinding(code: string, newFingerprint: string): Promise<string> {
  return toBase64url(await hmac(await handoverKey(code), newInput(newFingerprint)))
}

/** The running Fleet Console's binding over its fingerprint and the new one's. */
export async function oldConsoleBinding(code: string, oldFingerprint: string, newFingerprint: string): Promise<string> {
  return toBase64url(await hmac(await handoverKey(code), oldInput(oldFingerprint, newFingerprint)))
}

async function handoverMatches(code: string, input: Uint8Array, binding: string): Promise<boolean> {
  const mac = fromBase64url(binding)
  if (!mac || mac.length !== 32 || !normalizeJoinCode(code)) return false
  return hmacMatches(await handoverKey(code), input, mac)
}

export function verifyNewConsoleBinding(code: string, newFingerprint: string, binding: string): Promise<boolean> {
  return handoverMatches(code, newInput(newFingerprint), binding)
}

export function verifyOldConsoleBinding(code: string, oldFingerprint: string, newFingerprint: string, binding: string): Promise<boolean> {
  return handoverMatches(code, oldInput(oldFingerprint, newFingerprint), binding)
}

const certificateInput = (c: Omit<ConsoleHandoverCertificate, 'sig'>) =>
  canonical([`${HANDOVER}/certificate`, c.v, c.from, c.to.role, c.to.signingKey, c.to.sealingKey, c.machineName, c.issuedAt])

/** The running Fleet Console hands its machines to `to`. */
export async function signHandoverCertificate(
  sender: HostKeys, to: HostIdentity, machineName: string, now: number = Date.now(),
): Promise<ConsoleHandoverCertificate> {
  if (sender.identity.role !== 'console' || to.role !== 'console') throw new Error('Only a Fleet Console hands over, and only to a Fleet Console.')
  const unsigned = {
    v: 1 as const,
    from: await fingerprintOf(sender.identity),
    to: { role: 'console' as const, signingKey: to.signingKey, sealingKey: to.sealingKey },
    machineName,
    issuedAt: now,
  }
  const key = await importSigningPrivateKey(sender.signingPrivateKey)
  const sig = toBase64url(new Uint8Array(await subtle().sign({ name: 'Ed25519' }, key, certificateInput(unsigned))))
  return { ...unsigned, sig }
}

export type VerifiedHandover = { identity: HostIdentity & { role: 'console' }; fingerprint: string; machineName: string }

/**
 * The identity a certificate hands over to, only when `pinned` — the Fleet Console the caller pins now — signed it;
 * null for anything else, a certificate from another Fleet Console or one naming its own signer included.
 */
export async function verifyHandoverCertificate(value: unknown, pinned: HostIdentity): Promise<VerifiedHandover | null> {
  const c = parseHandoverCertificate(value)
  if (!c || pinned.role !== 'console') return null
  if (c.from !== (await fingerprintOf(pinned))) return null
  if (!isHostIdentity(c.to)) return null
  const fingerprint = await fingerprintOf(c.to)
  if (fingerprint === c.from) return null
  const sig = fromBase64url(c.sig)
  if (!sig || sig.length !== 64) return null
  const { sig: _sig, ...unsigned } = c
  const ok = await subtle().verify({ name: 'Ed25519' }, await importSigningPublicKey(pinned), sig, certificateInput(unsigned))
  return ok ? { identity: c.to, fingerprint, machineName: c.machineName } : null
}
