/**
 * The site's side of the move check over HTTP (../moveCheck.ts), shared by the site, the host service and the Fleet
 * Console. It sends the challenge, checks the answer, and only when the answer proves the address holds the hash
 * does it send its own proof. Anything else ends the check with nothing more sent. No redirect is followed: the
 * proofs are bound to the address asked, and another address would be a stranger's.
 */
import {
  MOVE_CHECK_PATH, MOVE_CHECK_VERSION, MOVE_PROOF_PATH,
  type MoveCheckOutcome, type MoveCheckSubject,
} from '../moveCheck.js'
import { checkMoveAnswer, createMoveChallenge } from './moveCheck.js'
import { concat, fromUtf8, type Bytes } from './webCrypto.js'

/** One POST of JSON: the status and up to `MAX_ANSWER_BYTES` of the body, or a throw when nothing answered. */
export type MoveCheckPost = (url: string, body: string, signal: unknown) => Promise<{ status: number; text: string }>

/** A real answer is a few hundred bytes; a stranger's larger one is not read. */
const MAX_ANSWER_BYTES = 16_384
const TIMEOUT_MS = 15_000

// Core compiles without Node's or the browser's type libraries (as webCrypto.ts), so the little of `fetch` used is
// typed here; the platform's own runs.
type Reader = { read(): Promise<{ done: boolean; value?: Bytes }>; cancel(): Promise<void> }
type FetchResponse = { status: number; body: { getReader(): Reader } | null }
type Fetch = (url: string, init: Record<string, unknown>) => Promise<FetchResponse>
type Platform = { fetch: Fetch; AbortSignal: { timeout(ms: number): unknown } }
const platform = globalThis as unknown as Platform

async function readCapped(res: FetchResponse): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Bytes[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    size += value.length
    if (size > MAX_ANSWER_BYTES) {
      await reader.cancel().catch(() => {})
      return ''
    }
    chunks.push(value)
  }
  return fromUtf8(concat(...chunks))
}

export const fetchPost: MoveCheckPost = async (url, body, signal) => {
  const res = await platform.fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body, redirect: 'manual', signal,
  })
  return { status: res.status, text: await readCapped(res) }
}

function json(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const looksLikeAnswer = (v: Record<string, unknown> | null) =>
  !!v && v.v === MOVE_CHECK_VERSION && typeof v.nonce === 'string' && typeof v.proof === 'string'

export type MoveCheckOptions = {
  /** The address to check, exactly as hq gave it or the person typed it. */
  address: string
  credential: string
  subject: MoveCheckSubject
  post?: MoveCheckPost
  timeoutMs?: number
}

export async function runMoveCheck(o: MoveCheckOptions): Promise<MoveCheckOutcome> {
  const post = o.post ?? fetchPost
  const base = o.address.replace(/\/+$/, '')
  if (!/^https?:\/\/[^/\s]+$/i.test(base)) return 'notHq'
  const send = (path: string, body: unknown) =>
    post(`${base}${path}`, JSON.stringify(body), platform.AbortSignal.timeout(o.timeoutMs ?? TIMEOUT_MS))
  const state = await createMoveChallenge(o.credential, o.subject, o.address)

  let first: { status: number; text: string }
  try {
    first = await send(MOVE_CHECK_PATH, state.challenge)
  } catch {
    return 'unreachable'
  }
  const answer = json(first.text)
  if (first.status === 403 && answer?.v === MOVE_CHECK_VERSION && answer.refused === 'unknown') return 'notThisHq'
  if (first.status !== 200 || !looksLikeAnswer(answer)) return 'notHq'
  const checked = await checkMoveAnswer(state, answer)
  if (!checked.ok) return 'notThisHq'

  let second: { status: number; text: string }
  try {
    second = await send(MOVE_PROOF_PATH, checked.proof)
  } catch {
    return 'unreachable'
  }
  const accepted = json(second.text)
  return second.status === 200 && accepted?.v === MOVE_CHECK_VERSION && accepted.ok === true ? 'passed' : 'notThisHq'
}
