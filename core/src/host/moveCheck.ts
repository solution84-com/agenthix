/**
 * The check a site, or a host service, makes before it switches to the address a moved hq gave it (host-management
 * spec §13): a mutual challenge–response keyed on the credential hash hq already stores.
 *
 * 1. The site sends a tag that names its credential without revealing it, and a fresh nonce.
 * 2. The address answers with its own nonce and a proof that it holds the hash, bound to both nonces and to the
 *    address itself — so a stranger who passes the challenge on to the real hq gets back a proof for the wrong
 *    address.
 * 3. Only when that proof checks does the site send its own proof, bound the same way. Otherwise it sends nothing
 *    more and stays on the old address.
 *
 * The credential never crosses the network, and a stranger's address learns a nonce and a tag it can do nothing
 * with. The computations are in `@agenthix/core/host-crypto`.
 */

export const MOVE_CHECK_VERSION = 1

/** The path on hq's new address that answers the check: the challenge, then the proof at `MOVE_PROOF_PATH`. */
export const MOVE_CHECK_PATH = '/api/v1/move-check'
export const MOVE_PROOF_PATH = '/api/v1/move-check/proof'

/**
 * A site checks with its site credential; a host service with its machine credential to hq's relay; a Fleet Console
 * elsewhere with its lasting console credential.
 */
export type MoveCheckSubject = 'site' | 'host' | 'console'

export const MOVE_CHECK_SUBJECTS: readonly MoveCheckSubject[] = ['site', 'host', 'console']

export type MoveChallenge = {
  v: typeof MOVE_CHECK_VERSION
  subject: MoveCheckSubject
  /** HMAC of a fixed label under the credential hash: names the credential, reveals nothing of it. */
  tag: string
  /** 32 random bytes, base64url. */
  nonce: string
}

export type MoveAnswer = {
  v: typeof MOVE_CHECK_VERSION
  nonce: string
  proof: string
}

export type MoveProof = {
  v: typeof MOVE_CHECK_VERSION
  subject: MoveCheckSubject
  tag: string
  /** The site's nonce and the address's, as the proof binds them. */
  siteNonce: string
  hqNonce: string
  proof: string
}

/** What hq answers at `MOVE_CHECK_PATH` when it holds no hash the tag names (HTTP 403). */
export type MoveRefusal = { v: typeof MOVE_CHECK_VERSION; refused: 'unknown' }

/** What hq answers at `MOVE_PROOF_PATH`: whether the site's proof held (HTTP 200 or 403). */
export type MoveProofAnswer = { v: typeof MOVE_CHECK_VERSION; ok: boolean }

/**
 * How a check ended, for the words a person reads: it passed both ways; nothing answered; the address answered as
 * an hq that does not hold this credential's record; or it answered as something that is not an hq at all.
 */
export type MoveCheckOutcome = 'passed' | 'unreachable' | 'notThisHq' | 'notHq'

/**
 * The address both sides bind the proofs to, made canonical: trimmed, lower case, without a trailing slash. Both ends
 * must use the address hq told the site, not one either worked out for itself.
 */
export function canonicalMoveAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\/+$/, '')
}
