/**
 * The one rule every versioned connection follows: two sides talk while their majors are at most one apart, and
 * the newer side speaks the older side's major. Every connection — hq and a site, hq and a host service or the
 * Fleet Console — asks this, never compares majors itself, so they cannot disagree.
 */
import { parseProtocolVersion, type ProtocolVersion } from './connection.js'

/** Which side must upgrade: this one (`own`) or the other (`peer`). Always the one behind. */
export type UpgradeSide = 'own' | 'peer'

export type ProtocolCompatibility =
  /**
   * The connection works. `peer` says where the peer stands against this side; `speak` is what this side may use:
   * the lower minor of a shared major, the peer's version when the peer is one major behind, and this side's own
   * when the peer is one major ahead (the peer adapts).
   */
  | { ok: true; peer: 'same' | 'behind' | 'ahead'; speak: ProtocolVersion }
  /** Two or more majors apart. */
  | { ok: false; reason: 'too_far_apart'; own: ProtocolVersion; peer: ProtocolVersion; upgrade: UpgradeSide }
  /** The peer stated no version. Whether that is accepted is the caller's choice. */
  | { ok: false; reason: 'absent'; own: ProtocolVersion }
  /** The peer stated something that is not a `major.minor` version. */
  | { ok: false; reason: 'malformed'; own: ProtocolVersion; presented: string }

export type ProtocolRefusal = Extract<ProtocolCompatibility, { ok: false }>

/**
 * `own` is this side's constant, so a malformed one is a programming error and throws; `peer` comes off the wire.
 */
export function checkProtocolCompatibility(own: string, peer: string | null | undefined): ProtocolCompatibility {
  const o = parseProtocolVersion(own)
  if (!o) throw new Error(`A protocol version must be "major.minor"; this side's is ${JSON.stringify(own)}.`)
  if (peer == null || peer.trim() === '') return { ok: false, reason: 'absent', own: o }
  const p = parseProtocolVersion(peer)
  if (!p) return { ok: false, reason: 'malformed', own: o, presented: peer }

  const gap = p.major - o.major
  if (gap === 0) return { ok: true, peer: 'same', speak: { major: o.major, minor: Math.min(o.minor, p.minor) } }
  if (gap === -1) return { ok: true, peer: 'behind', speak: p }
  if (gap === 1) return { ok: true, peer: 'ahead', speak: o }
  return { ok: false, reason: 'too_far_apart', own: o, peer: p, upgrade: gap < 0 ? 'peer' : 'own' }
}

/** A refusal in words, naming both sides as the caller does (`{ own: 'this site', peer: 'HQ' }`). */
export function protocolRefusalMessage(refusal: ProtocolRefusal, names: { own: string; peer: string }): string {
  if (refusal.reason === 'too_far_apart') {
    return `${names.peer} speaks protocol ${show(refusal.peer)} and ${names.own} speaks ${show(refusal.own)}, ` +
      `too far apart to work together: upgrade ${refusal.upgrade === 'own' ? names.own : names.peer}.`
  }
  const tail = `; ${names.own} speaks ${show(refusal.own)}.`
  return refusal.reason === 'absent'
    ? `${names.peer} stated no protocol version${tail}`
    : `${names.peer} stated the protocol version ${JSON.stringify(refusal.presented)}, which is not one${tail}`
}

function show(v: ProtocolVersion): string {
  return `${v.major}.${v.minor}`
}

/**
 * What a 426 from the peer means, in words. The peer states its own version with the refusal, and this side applies
 * the same rule to say which of the two must upgrade.
 */
export function peerRefusalMessage(own: string, stated: string | null | undefined, names: { own: string; peer: string }): string {
  const c = checkProtocolCompatibility(own, stated)
  if (!c.ok && c.reason === 'too_far_apart') return protocolRefusalMessage(c, names)
  return c.ok
    ? `${names.peer} speaks protocol ${stated!.trim()} and refused ${names.own}'s ${own}.`
    : `${names.peer} refused ${names.own}'s protocol ${own} and stated no version of its own that ${names.own} can read.`
}
