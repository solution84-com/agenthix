/**
 * The move's challenge–response (see ../moveCheck.ts for the exchange). Every value is an HMAC under the credential
 * hash, the SHA-256 hex digest hq already stores (`hashCredential` in hq). The site derives the hash from its
 * credential; hq has it. The tag, hq's proof and the site's proof use different labels, so none stands in for
 * another.
 *
 * What it proves, and what it cannot: each side shows it holds the hash. Whoever holds hq's database holds every
 * hash, and so could pass this check — the check guards against an address that is not hq, not against a copy of hq.
 */
import {
  MOVE_CHECK_VERSION, canonicalMoveAddress,
  type MoveAnswer, type MoveChallenge, type MoveCheckSubject, type MoveProof,
} from '../moveCheck.js'
import { canonical, fromBase64url, fromHex, hmac, hmacMatches, randomBytes, sha256, toBase64url, toHex, utf8 } from './webCrypto.js'

const LABEL = 'move-check/1'
const SHA256_HEX = /^[0-9a-f]{64}$/i

/** The same digest hq stores for a credential: SHA-256 of its UTF-8, lower-case hex. */
export async function credentialHashOf(credential: string): Promise<string> {
  return toHex(await sha256(utf8(credential)))
}

function hashKey(credentialHash: string): Uint8Array {
  if (!SHA256_HEX.test(credentialHash)) throw new Error('Not a credential hash')
  return fromHex(credentialHash.toLowerCase())!
}

const tagInput = (subject: MoveCheckSubject) => canonical([`${LABEL}/tag`, subject])
const proofInput = (side: 'hq' | 'site', subject: MoveCheckSubject, address: string, siteNonce: string, hqNonce: string) =>
  canonical([`${LABEL}/${side}`, subject, canonicalMoveAddress(address), siteNonce, hqNonce])

/** The tag a site's challenge carries. hq compares it with the tag of each hash it stores, by `moveTagMatches`. */
export async function moveCheckTag(credentialHash: string, subject: MoveCheckSubject): Promise<string> {
  return toBase64url(await hmac(hashKey(credentialHash), tagInput(subject)))
}

export function moveTagMatches(credentialHash: string, challenge: MoveChallenge): Promise<boolean> {
  const tag = fromBase64url(challenge.tag)
  if (!tag || tag.length !== 32 || !SHA256_HEX.test(credentialHash)) return Promise.resolve(false)
  return hmacMatches(hashKey(credentialHash), tagInput(challenge.subject), tag)
}

/** What the site keeps between its challenge and the answer. */
export type MoveCheckState = { challenge: MoveChallenge; credentialHash: string; address: string }

/** Step 1, on the site: the challenge to send to `address`. */
export async function createMoveChallenge(credential: string, subject: MoveCheckSubject, address: string): Promise<MoveCheckState> {
  const credentialHash = await credentialHashOf(credential)
  return {
    challenge: { v: MOVE_CHECK_VERSION, subject, tag: await moveCheckTag(credentialHash, subject), nonce: toBase64url(randomBytes(32)) },
    credentialHash,
    address,
  }
}

const nonceOk = (n: unknown): n is string => typeof n === 'string' && fromBase64url(n)?.length === 32

/** Step 2, on hq: the answer, once the tag has matched a stored hash. `ownAddress` is the address hq told the site. */
export async function answerMoveChallenge(credentialHash: string, ownAddress: string, challenge: MoveChallenge): Promise<MoveAnswer> {
  if (!nonceOk(challenge.nonce)) throw new Error('Not a move challenge')
  const hqNonce = toBase64url(randomBytes(32))
  const proof = await hmac(hashKey(credentialHash), proofInput('hq', challenge.subject, ownAddress, challenge.nonce, hqNonce))
  return { v: MOVE_CHECK_VERSION, nonce: hqNonce, proof: toBase64url(proof) }
}

/**
 * Step 3, on the site: whether the address proved it holds the hash. Only on true does it return the site's proof to
 * send; on false the site sends nothing more.
 */
export async function checkMoveAnswer(state: MoveCheckState, answer: unknown): Promise<{ ok: true; proof: MoveProof } | { ok: false }> {
  const a = answer && typeof answer === 'object' ? (answer as Record<string, unknown>) : null
  if (!a || a.v !== MOVE_CHECK_VERSION || !nonceOk(a.nonce) || typeof a.proof !== 'string') return { ok: false }
  const mac = fromBase64url(a.proof)
  if (!mac || mac.length !== 32) return { ok: false }
  const { challenge, credentialHash, address } = state
  const key = hashKey(credentialHash)
  if (!(await hmacMatches(key, proofInput('hq', challenge.subject, address, challenge.nonce, a.nonce), mac))) return { ok: false }
  const proof = await hmac(key, proofInput('site', challenge.subject, address, challenge.nonce, a.nonce))
  return {
    ok: true,
    proof: {
      v: MOVE_CHECK_VERSION, subject: challenge.subject, tag: challenge.tag,
      siteNonce: challenge.nonce, hqNonce: a.nonce, proof: toBase64url(proof),
    },
  }
}

/** Step 4, on hq: whether the site proved it holds the hash for this address. */
export async function verifyMoveProof(credentialHash: string, ownAddress: string, proof: MoveProof): Promise<boolean> {
  const mac = fromBase64url(proof.proof)
  if (!mac || mac.length !== 32 || !nonceOk(proof.siteNonce) || !nonceOk(proof.hqNonce)) return false
  if (!SHA256_HEX.test(credentialHash)) return false
  return hmacMatches(hashKey(credentialHash), proofInput('site', proof.subject, ownAddress, proof.siteNonce, proof.hqNonce), mac)
}
