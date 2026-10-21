import { describe, expect, it } from 'vitest'
import { MOVE_CHECK_PATH, MOVE_PROOF_PATH, type MoveChallenge, type MoveProof } from '../moveCheck.js'
import {
  answerMoveChallenge, credentialHashOf, moveTagMatches, runMoveCheck, verifyMoveProof, type MoveCheckPost,
} from '../crypto/index.js'

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '')
const credential = 'site-credential-' + 'cd'.repeat(24)
const address = 'http://198.51.100.24:4100'

/** An hq at `own` holding `hashes`; it records every request it is sent. */
function hq(own: string, hashes: string[]) {
  const sent: { path: string; body: unknown }[] = []
  const issued = new Map<string, string>()
  const post: MoveCheckPost = async (url, body) => {
    const path = pathOf(url)
    const parsed = JSON.parse(body) as unknown
    sent.push({ path, body: parsed })
    if (path === MOVE_CHECK_PATH) {
      const challenge = parsed as MoveChallenge
      for (const hash of hashes) {
        if (!(await moveTagMatches(hash, challenge))) continue
        const answer = await answerMoveChallenge(hash, own, challenge)
        issued.set(answer.nonce, hash)
        return { status: 200, text: JSON.stringify(answer) }
      }
      return { status: 403, text: JSON.stringify({ v: 1, refused: 'unknown' }) }
    }
    if (path === MOVE_PROOF_PATH) {
      const proof = parsed as MoveProof
      const hash = issued.get(proof.hqNonce)
      const ok = !!hash && (await verifyMoveProof(hash, own, proof))
      return { status: ok ? 200 : 403, text: JSON.stringify({ v: 1, ok }) }
    }
    return { status: 404, text: 'not found' }
  }
  return { post, sent }
}

describe('the move check over HTTP', () => {
  it('passes against the hq that holds the hash, sending the proof only after its answer checks', async () => {
    const real = hq(address, [await credentialHashOf('another'), await credentialHashOf(credential)])
    expect(await runMoveCheck({ address, credential, subject: 'site', post: real.post })).toBe('passed')
    expect(real.sent.map(s => s.path)).toEqual([MOVE_CHECK_PATH, MOVE_PROOF_PATH])
    expect(JSON.stringify(real.sent)).not.toContain(credential)
    expect(JSON.stringify(real.sent)).not.toContain(await credentialHashOf(credential))
  })

  it('stops after the challenge at an hq that does not hold the hash', async () => {
    const other = hq(address, [await credentialHashOf('someone else')])
    expect(await runMoveCheck({ address, credential, subject: 'site', post: other.post })).toBe('notThisHq')
    expect(other.sent.map(s => s.path)).toEqual([MOVE_CHECK_PATH])
  })

  it('sends no proof to a stranger who passes the challenge on to the real hq', async () => {
    const realHq = hq('https://hq.acme.example', [await credentialHashOf(credential)])
    const sent: string[] = []
    const stranger: MoveCheckPost = async (url, body, signal) => {
      sent.push(pathOf(url))
      return realHq.post(`https://hq.acme.example${pathOf(url)}`, body, signal)
    }
    expect(await runMoveCheck({ address: 'http://203.0.113.66', credential, subject: 'host', post: stranger })).toBe('notThisHq')
    expect(sent).toEqual([MOVE_CHECK_PATH])
  })

  it('says nothing answers when the address cannot be reached', async () => {
    const down: MoveCheckPost = async () => { throw new Error('ECONNREFUSED') }
    expect(await runMoveCheck({ address, credential, subject: 'console', post: down })).toBe('unreachable')
  })

  it('says it is not an hq when the address answers with anything else', async () => {
    const sent: string[] = []
    const web: MoveCheckPost = async url => {
      sent.push(url)
      return { status: 200, text: '<html>welcome</html>' }
    }
    expect(await runMoveCheck({ address, credential, subject: 'site', post: web })).toBe('notHq')
    const redirect: MoveCheckPost = async () => ({ status: 302, text: '' })
    expect(await runMoveCheck({ address, credential, subject: 'site', post: redirect })).toBe('notHq')
    expect(await runMoveCheck({ address: 'not an address', credential, subject: 'site', post: web })).toBe('notHq')
    expect(sent).toHaveLength(1)
  })

  it('does not pass when hq refuses the proof', async () => {
    const real = hq(address, [await credentialHashOf(credential)])
    const refusing: MoveCheckPost = async (url, body, signal) =>
      pathOf(url) === MOVE_PROOF_PATH ? { status: 403, text: JSON.stringify({ v: 1, ok: false }) } : real.post(url, body, signal)
    expect(await runMoveCheck({ address, credential, subject: 'site', post: refusing })).toBe('notThisHq')
  })
})
