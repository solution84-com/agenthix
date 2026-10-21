/**
 * Connecting a machine to the Fleet Console (host-management spec §6): a fleet admin gets a one-time code, the
 * machine admin runs `console connect <hq address> <code>`, the fleet admin confirms the machine's name and
 * fingerprint, and the two pin each other's identity.
 *
 * hq carries every step but must not be able to put itself in the middle. So the code itself never reaches hq: hq is
 * given only a lookup derived from it, to admit the joining machine, and each side proves it holds the code with a
 * binding over its own fingerprint, which hq cannot make without it. The fleet admin's comparison of fingerprints is
 * the second guard. The derivations are in `@agenthix/core/host-crypto`.
 */
import type { HostEnvelope, HostIdentity } from './envelope.js'

/**
 * Crockford's base32: no I, L, O or U, so a code read aloud or copied by hand survives. Twelve characters are 60 bits
 * — enough that hq, holding only the lookup, cannot search for the code within its hour.
 */
export const JOIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const JOIN_CODE_LENGTH = 12

/** "Works once, for 1 hour" (the boards). */
export const JOIN_CODE_TTL_MS = 60 * 60_000

/**
 * What the code is for: adding a site, receiving a site or hq that moves to this machine (spec §13), or restoring a
 * site whose machine was lost, from its backup, onto this one (adr-0119). `siteId` is hq's id for the site.
 */
export type JoinPurpose =
  | { kind: 'add' }
  | { kind: 'moveSite'; siteId: string }
  | { kind: 'moveHq' }
  | { kind: 'restoreSite'; siteId: string }

/** The backup a machine that joins to restore a lost site says it restores: under its binding, so hq cannot alter it. */
export type JoinRestoreClaim = { siteName: string; takenAt: string }

const CLAIM_NAME = /^[^\u0000-\u001f\u007f]{1,64}$/

/** A restore claim's shape; null when it is not one. `takenAt` comes back as the ISO time it names. */
export function parseRestoreClaim(value: unknown): JoinRestoreClaim | null {
  const c = value as Partial<JoinRestoreClaim> | null
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  if (typeof c.siteName !== 'string' || !CLAIM_NAME.test(c.siteName)) return null
  if (typeof c.takenAt !== 'string' || c.takenAt.length > 40 || Number.isNaN(Date.parse(c.takenAt))) return null
  if (new Date(c.takenAt).toISOString() !== c.takenAt) return null
  return { siteName: c.siteName, takenAt: c.takenAt }
}

/**
 * A code as a person typed or pasted it, made canonical: upper case, separators dropped, and the letters Crockford
 * reads as digits (I and L as 1, O as 0) mapped. Null when it is not twelve characters of the alphabet.
 */
export function normalizeJoinCode(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  if (raw.length !== JOIN_CODE_LENGTH) return null
  for (const c of raw) if (!JOIN_CODE_ALPHABET.includes(c)) return null
  return raw
}

/** `K7QM4XPD93TB` as `K7QM-4XPD-93TB`, as the screens and the CLI print it. */
export function formatJoinCode(code: string): string {
  return code.match(/.{1,4}/g)!.join('-')
}

/**
 * A Fleet Console's one-time code (`hq console-code`) says in its first character what it is for, so the new Fleet
 * Console knows before it connects whether it must receive machines:
 *
 * - **fresh** — made by hq when no Fleet Console runs to hand over: it starts with `H`, then eleven random characters
 *   (55 bits). hq made it, so it is no secret from hq; it only has to resist guessing over the network within its hour,
 *   one try per connection.
 * - **handover** — made by the running Fleet Console: its first character is any of the other 31, then eleven random
 *   characters (log2(31 × 32^11) ≈ 59.95 bits), all uniform. hq is given only its lookup and must not find it.
 *
 * Twelve characters of a 32-letter alphabet are exactly 60 bits, so two kinds told apart in the code cannot both
 * keep 60: the handover code, the one hq must not learn, keeps all but a twentieth of a bit.
 */
export const CONSOLE_FRESH_CODE_MARK = 'H'

export type ConsoleCodeKind = 'handover' | 'fresh'

/** What a Fleet Console's one-time code is for; null when it is not a code. */
export function consoleCodeKind(code: string): ConsoleCodeKind | null {
  const c = normalizeJoinCode(code)
  if (!c) return null
  return c[0] === CONSOLE_FRESH_CODE_MARK ? 'fresh' : 'handover'
}

/** The joining machine's half: what it sends hq, which passes it to the Fleet Console. */
export type JoinRequest = {
  /** Derived from the code; hq admits the connection by it. */
  lookup: string
  identity: { role: 'host'; signingKey: string; sealingKey: string }
  machineName: string
  /**
   * "This machine runs HQ": set by the host service only when it runs hq itself, so a Fleet Console started anew after
   * the one it answered was lost can know hq's machine again — once a fleet admin confirms it. Under the binding.
   */
  runsHq?: true
  /** "This machine restores this backup of a lost site" (adr-0119): set only with a code for restoring. Under the binding. */
  restores?: JoinRestoreClaim
  /** Proves the machine holds the code, over its own fingerprint and what it claims. */
  binding: string
}

/** The Fleet Console's half, once the fleet admin confirmed: what the machine pins. */
export type JoinAcceptance = {
  identity: { role: 'console'; signingKey: string; sealingKey: string }
  /** Proves the Fleet Console holds the code, over both fingerprints. */
  binding: string
}

/**
 * Moving the Fleet Console to another machine (host-management spec §7) without breaking any machine's pin. A machine
 * admin of hq's machine asks the running Fleet Console — on the machine, never through hq — for a one-time code of the
 * same form as a join code. hq is given only a lookup derived from it, under a label of its own, so the code is
 * never a join code's lookup. The new Fleet Console presents the lookup to hq and sends its identity with a binding
 * over its fingerprint that needs the code; hq passes that to the running Fleet Console, which checks it. hq cannot
 * put its own identity there without the code.
 *
 * The running Fleet Console then signs a handover certificate naming the new identity, and seals it, with the machines
 * it pinned, to the new Fleet Console, together with its own binding that proves it holds the same code. Each host
 * service moves its pin only on a certificate signed by the Fleet Console it pinned. The derivations and the signature
 * are in `@agenthix/core/host-crypto`.
 */
type ConsoleIdentity = { role: 'console'; signingKey: string; sealingKey: string }

/** The new Fleet Console's half, sent once its connection with the lookup is open. */
export type ConsoleHandoverAsk = {
  identity: ConsoleIdentity
  /** The new Fleet Console's machine, for the words people read. */
  machineName: string
  /** Proves the new Fleet Console holds the code, over its own fingerprint. */
  binding: string
}

/** The running Fleet Console's answer, passed by hq to the new one. */
export type ConsoleHandoverAcceptance = {
  identity: ConsoleIdentity
  /** Proves the running Fleet Console holds the same code, over both fingerprints. */
  binding: string
  /** Sealed to the new Fleet Console and signed by the running one: a `handoverState` message. */
  envelope: HostEnvelope
}

/**
 * Signed by the Fleet Console a machine pinned: "my machines pin this identity from now on". It is not secret and
 * does not expire: hq hands every one it holds to each machine as it connects, and a machine acts only on one
 * signed by the Fleet Console it pins now, so a machine that was offline during the move follows it later, and an old
 * certificate does nothing to a machine that has moved on.
 */
export type ConsoleHandoverCertificate = {
  v: 1
  /** The fingerprint of the Fleet Console that signs it. */
  from: string
  to: ConsoleIdentity
  /** The new Fleet Console's machine, for the words people read. */
  machineName: string
  issuedAt: number
  /** Ed25519 over every other field, base64url. */
  sig: string
}

/** A machine the running Fleet Console pinned, as the new one is given it (the console's own pinned-host record). */
export type HandedOverHost = {
  fingerprint: string
  hostId: string
  identity: HostIdentity
  machineName: string
  siteName: string
  executionSiteId: string | null
  connectedAt: string
  connectedBy: string | null
  hqMachine?: boolean
  /** Whether the fleet admins are told when it stops answering; absent is yes. */
  notifyIfSilent?: boolean
}

const B64URL_KEY = /^[A-Za-z0-9_-]{43}$/
const SIG = /^[A-Za-z0-9_-]{86}$/
const FINGERPRINT_HEX = /^[0-9a-f]{64}$/

/** A handover certificate's shape, before any cryptography; null when it is not one. */
export function parseHandoverCertificate(value: unknown): ConsoleHandoverCertificate | null {
  const c = value as Partial<ConsoleHandoverCertificate> | null
  if (!c || typeof c !== 'object' || Array.isArray(c) || c.v !== 1) return null
  const to = c.to as Partial<ConsoleIdentity> | undefined
  if (typeof c.from !== 'string' || !FINGERPRINT_HEX.test(c.from)) return null
  if (!to || to.role !== 'console' || typeof to.signingKey !== 'string' || !B64URL_KEY.test(to.signingKey) ||
    typeof to.sealingKey !== 'string' || !B64URL_KEY.test(to.sealingKey)) return null
  if (typeof c.machineName !== 'string' || c.machineName.length === 0 || c.machineName.length > 64 || /[\u0000-\u001f\u007f]/.test(c.machineName)) return null
  if (typeof c.issuedAt !== 'number' || !Number.isSafeInteger(c.issuedAt) || c.issuedAt <= 0) return null
  if (typeof c.sig !== 'string' || !SIG.test(c.sig)) return null
  return {
    v: 1, from: c.from, to: { role: 'console', signingKey: to.signingKey, sealingKey: to.sealingKey },
    machineName: c.machineName, issuedAt: c.issuedAt, sig: c.sig,
  }
}

/**
 * Enrolling a machine with Agenthix Cloud (pre-release spec B2): the same one-time code and derivations as joining a
 * Fleet Console, under a label of the `cloud` role (`cloudJoinLookup` and the Cloud bindings in
 * `@agenthix/core/host-crypto`), so a Cloud code is never a Fleet Console join, nor the reverse. The host service dials
 * Cloud's `/host-link` with the lookup in `X-Host-Join`; nothing passes through hq. Cloud gives no bearer secret: from
 * then on the machine dials with its machine id, and Cloud proves itself with its first envelope.
 */
export type CloudJoinRequest = {
  lookup: string
  identity: { role: 'host'; signingKey: string; sealingKey: string }
  machineName: string
  /** The machine id from the host service's start-up settings, when they give one. Under the binding. */
  machineId?: string
  /** Proves the machine holds the code, over its own fingerprint and the machine id. */
  binding: string
}

/** Cloud's half: what the machine pins. */
export type CloudJoinAcceptance = {
  identity: { role: 'cloud'; signingKey: string; sealingKey: string }
  /** Proves Cloud holds the code, over both fingerprints and the machine id it answers with. */
  binding: string
}

/** A machine id as Cloud names a machine: printable, at most 128 characters. */
export const CLOUD_MACHINE_ID = /^[A-Za-z0-9._:-]{1,128}$/

const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/

/** Cloud's acceptance's shape, before any cryptography; null when it is not one. */
export function parseCloudJoinAcceptance(value: unknown): CloudJoinAcceptance | null {
  const a = value as { identity?: Partial<HostIdentity>; binding?: unknown } | null
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null
  const id = a.identity
  if (!id || typeof id !== 'object' || id.role !== 'cloud') return null
  if (typeof id.signingKey !== 'string' || !PUBLIC_KEY.test(id.signingKey)) return null
  if (typeof id.sealingKey !== 'string' || !PUBLIC_KEY.test(id.sealingKey)) return null
  if (typeof a.binding !== 'string' || a.binding.length > 64) return null
  return { identity: { role: 'cloud', signingKey: id.signingKey, sealingKey: id.sealingKey }, binding: a.binding }
}
