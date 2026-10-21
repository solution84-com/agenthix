/**
 * hq's side of the move check (host-management spec §13; core's `host/moveCheck.ts`): at its new address, hq proves
 * to a site, a host service or the Fleet Console that it holds the hash of that one's credential, and checks the
 * proof that comes back. hq answers with its own address, the one it told them, so a proof passed on from another
 * address does not hold.
 *
 * The answer is given only for a tag that names a hash hq holds; anything else is refused the same way, so a caller
 * learns nothing about which credentials exist. The nonce hq answers with is kept for a minute and taken once: a
 * proof is checked only against the hash its challenge named.
 */
import {
  MOVE_CHECK_SUBJECTS, MOVE_CHECK_VERSION,
  type MoveChallenge, type MoveCheckSubject, type MoveProof, type MoveProofAnswer, type MoveRefusal,
} from '@agenthix/core'
import { answerMoveChallenge, moveTagMatches, verifyMoveProof } from '@agenthix/core/host-crypto'

export type MoveCheckDeps = {
  /** The credential hashes hq holds for those who may check it: sites, host services, or the Fleet Console. */
  hashes: (subject: MoveCheckSubject) => Promise<string[]>
  /** hq's own address, as it told them. */
  ownAddress: () => string
  now?: () => number
  log?: (line: string) => void
}

export type MoveCheckReply = { status: number; body: unknown }

const ANSWER_LIFETIME_MS = 60_000
const MAX_OPEN = 1_000
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/

type Open = { hash: string; subject: MoveCheckSubject; tag: string; siteNonce: string; until: number }

const refused: MoveRefusal = { v: MOVE_CHECK_VERSION, refused: 'unknown' }
const malformed: MoveCheckReply = { status: 400, body: { error: 'Not a move check.' } }

function record(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
}

const subjectOf = (v: unknown): MoveCheckSubject | null =>
  MOVE_CHECK_SUBJECTS.includes(v as MoveCheckSubject) ? (v as MoveCheckSubject) : null

const token = (v: unknown): v is string => typeof v === 'string' && TOKEN.test(v)

export class MoveCheckDesk {
  private readonly open = new Map<string, Open>()

  constructor(private readonly deps: MoveCheckDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  async challenge(body: unknown): Promise<MoveCheckReply> {
    const b = record(body)
    const subject = subjectOf(b?.subject)
    if (!b || b.v !== MOVE_CHECK_VERSION || !subject || !token(b.tag) || !token(b.nonce)) return malformed
    const challenge: MoveChallenge = { v: MOVE_CHECK_VERSION, subject, tag: b.tag, nonce: b.nonce }
    for (const hash of await this.deps.hashes(subject)) {
      if (!(await moveTagMatches(hash, challenge))) continue
      const answer = await answerMoveChallenge(hash, this.deps.ownAddress(), challenge)
      this.keep(answer.nonce, { hash, subject, tag: challenge.tag, siteNonce: challenge.nonce, until: this.now() + ANSWER_LIFETIME_MS })
      return { status: 200, body: answer }
    }
    return { status: 403, body: refused }
  }

  async proof(body: unknown): Promise<MoveCheckReply> {
    const b = record(body)
    const subject = subjectOf(b?.subject)
    if (!b || b.v !== MOVE_CHECK_VERSION || !subject || !token(b.tag) || !token(b.siteNonce) || !token(b.hqNonce) || !token(b.proof)) {
      return malformed
    }
    const open = this.open.get(b.hqNonce)
    this.open.delete(b.hqNonce)
    const proof: MoveProof = { v: MOVE_CHECK_VERSION, subject, tag: b.tag, siteNonce: b.siteNonce, hqNonce: b.hqNonce, proof: b.proof }
    const ok = !!open && open.until > this.now() && open.subject === subject && open.tag === proof.tag &&
      open.siteNonce === proof.siteNonce && (await verifyMoveProof(open.hash, this.deps.ownAddress(), proof))
    if (ok) this.deps.log?.(`A ${subject === 'console' ? 'Fleet Console' : subject === 'host' ? 'host service' : 'site'} passed the move check at ${this.deps.ownAddress()}.`)
    const answer: MoveProofAnswer = { v: MOVE_CHECK_VERSION, ok }
    return { status: ok ? 200 : 403, body: answer }
  }

  private keep(nonce: string, open: Open): void {
    const now = this.now()
    for (const [key, value] of this.open) if (value.until <= now) this.open.delete(key)
    while (this.open.size >= MAX_OPEN) this.open.delete(this.open.keys().next().value as string)
    this.open.set(nonce, open)
  }
}
