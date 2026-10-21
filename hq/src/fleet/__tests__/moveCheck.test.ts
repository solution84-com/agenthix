import { describe, expect, it } from 'vitest'
import { MOVE_CHECK_PATH, MOVE_PROOF_PATH, type MoveCheckSubject } from '@agenthix/core'
import { checkMoveAnswer, createMoveChallenge, credentialHashOf, runMoveCheck, type MoveCheckPost } from '@agenthix/core/host-crypto'
import { MoveCheckDesk } from '../moveCheck'

const ADDRESS = 'http://198.51.100.24:4100'
const siteCredential = 'site-' + 'ab'.repeat(32)
const machineCredential = 'hmc_' + 'cd'.repeat(28)

async function desk(own = ADDRESS, now = () => Date.now()) {
  const held: Record<MoveCheckSubject, string[]> = {
    site: [await credentialHashOf('someone else'), await credentialHashOf(siteCredential)],
    host: [await credentialHashOf(machineCredential)],
    console: [],
  }
  return new MoveCheckDesk({ hashes: async s => held[s], ownAddress: () => own, now })
}

/** The desk behind HTTP as hq serves it, recording each request. */
function over(d: MoveCheckDesk) {
  const sent: string[] = []
  const post: MoveCheckPost = async (url, body) => {
    const path = new URL(url).pathname
    sent.push(path)
    const reply = path === MOVE_CHECK_PATH ? await d.challenge(JSON.parse(body)) : path === MOVE_PROOF_PATH ? await d.proof(JSON.parse(body)) : { status: 404, body: '' }
    return { status: reply.status, text: JSON.stringify(reply.body) }
  }
  return { post, sent }
}

describe("hq's side of the move check @SC-936", () => {
  it('answers a site and a host service whose credential it holds, and takes their proof', async () => {
    const http = over(await desk())
    expect(await runMoveCheck({ address: ADDRESS, credential: siteCredential, subject: 'site', post: http.post })).toBe('passed')
    expect(await runMoveCheck({ address: ADDRESS, credential: machineCredential, subject: 'host', post: http.post })).toBe('passed')
  })

  it('refuses a credential it does not hold, or one of another kind, the same way', async () => {
    const d = await desk()
    const http = over(d)
    expect(await runMoveCheck({ address: ADDRESS, credential: 'guessed', subject: 'site', post: http.post })).toBe('notThisHq')
    expect(await runMoveCheck({ address: ADDRESS, credential: machineCredential, subject: 'site', post: http.post })).toBe('notThisHq')
    expect(await runMoveCheck({ address: ADDRESS, credential: siteCredential, subject: 'console', post: http.post })).toBe('notThisHq')
    expect(http.sent).toEqual([MOVE_CHECK_PATH, MOVE_CHECK_PATH, MOVE_CHECK_PATH])
  })

  it('binds its answer to its own address, so a site asking about another address does not pass', async () => {
    const http = over(await desk('https://hq.acme.example'))
    expect(await runMoveCheck({ address: ADDRESS, credential: siteCredential, subject: 'site', post: http.post })).toBe('notThisHq')
    expect(http.sent).toEqual([MOVE_CHECK_PATH])
  })

  it('checks a proof once, within a minute, against the hash its challenge named', async () => {
    let clock = 1_000_000
    const d = await desk(ADDRESS, () => clock)
    let kept: { proof: unknown } = { proof: null }
    const recording: MoveCheckPost = async (url, body) => {
      const path = new URL(url).pathname
      const parsed = JSON.parse(body)
      if (path === MOVE_PROOF_PATH) kept = { proof: parsed }
      const reply = path === MOVE_CHECK_PATH ? await d.challenge(parsed) : await d.proof(parsed)
      return { status: reply.status, text: JSON.stringify(reply.body) }
    }
    expect(await runMoveCheck({ address: ADDRESS, credential: siteCredential, subject: 'site', post: recording })).toBe('passed')
    expect((await d.proof(kept.proof)).status).toBe(403)


    const state = await createMoveChallenge(siteCredential, 'site', ADDRESS)
    const checked = await checkMoveAnswer(state, (await d.challenge(state.challenge)).body)
    if (!checked.ok) throw new Error('the answer should check')
    clock += 61_000
    expect((await d.proof(checked.proof)).body).toEqual({ v: 1, ok: false })
  })

  it('refuses what is not a move check', async () => {
    const d = await desk()
    expect((await d.challenge(null)).status).toBe(400)
    expect((await d.challenge({ v: 1, subject: 'root', tag: 'a', nonce: 'b' })).status).toBe(400)
    expect((await d.challenge({ v: 2, subject: 'site', tag: 'a', nonce: 'b' })).status).toBe(400)
    expect((await d.proof({ v: 1, subject: 'site', tag: 'a', siteNonce: 'b', hqNonce: 'c', proof: 'x'.repeat(200) })).status).toBe(400)
    expect((await d.proof({ v: 1, subject: 'site', tag: 'a', siteNonce: 'b', hqNonce: 'c', proof: 'd' })).body).toEqual({ v: 1, ok: false })
  })
})
