import { describe, expect, it } from 'vitest'
import {
  answerMoveChallenge, checkMoveAnswer, createMoveChallenge, credentialHashOf, moveCheckTag, moveTagMatches,
  verifyMoveProof,
} from '../crypto/index.js'

const credential = 'smc_1a2b3c4d_' + 'ab'.repeat(24)
const address = 'https://hq.acme.example'

describe('the move check', () => {
  it('hashes a credential exactly as hq stores it', async () => {
    expect(await credentialHashOf('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('passes both ways between a site and the hq that holds its hash', async () => {
    const stored = await credentialHashOf(credential)
    const state = await createMoveChallenge(credential, 'site', address)
    expect(await moveTagMatches(stored, state.challenge)).toBe(true)
    const answer = await answerMoveChallenge(stored, address, state.challenge)
    const checked = await checkMoveAnswer(state, answer)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(await verifyMoveProof(stored, address, checked.proof)).toBe(true)
  })

  it('never puts the credential or its hash on the wire', async () => {
    const stored = await credentialHashOf(credential)
    const state = await createMoveChallenge(credential, 'site', address)
    const answer = await answerMoveChallenge(stored, address, state.challenge)
    const checked = await checkMoveAnswer(state, answer)
    const wire = JSON.stringify([state.challenge, answer, checked.ok ? checked.proof : null])
    expect(wire).not.toContain(credential)
    expect(wire).not.toContain(stored)
    expect(wire).not.toContain('ab'.repeat(24))
  })

  it('refuses an address that does not hold the hash, and the site then sends nothing', async () => {
    const state = await createMoveChallenge(credential, 'site', address)
    const stranger = await credentialHashOf('a different credential')
    expect(await moveTagMatches(stranger, state.challenge)).toBe(false)
    const answer = await answerMoveChallenge(stranger, address, state.challenge)
    expect(await checkMoveAnswer(state, answer)).toEqual({ ok: false })
    expect(await checkMoveAnswer(state, { v: 1, nonce: answer.nonce, proof: 'x' })).toEqual({ ok: false })
    expect(await checkMoveAnswer(state, null)).toEqual({ ok: false })
  })

  it('refuses a stranger that passes the challenge on to the real hq', async () => {
    const stored = await credentialHashOf(credential)
    const state = await createMoveChallenge(credential, 'site', 'https://evil.example')
    const relayed = await answerMoveChallenge(stored, address, state.challenge)
    expect(await checkMoveAnswer(state, relayed)).toEqual({ ok: false })
  })

  it('refuses a site that does not know its credential, or proves it for another address', async () => {
    const stored = await credentialHashOf(credential)
    const impostor = await createMoveChallenge('a guessed credential', 'site', address)
    const answer = await answerMoveChallenge(stored, address, impostor.challenge)
    expect(await checkMoveAnswer(impostor, answer)).toEqual({ ok: false })

    const state = await createMoveChallenge(credential, 'site', address)
    const checked = await checkMoveAnswer(state, await answerMoveChallenge(stored, address, state.challenge))
    if (!checked.ok) throw new Error('expected the check to pass')
    expect(await verifyMoveProof(stored, 'https://elsewhere.example', checked.proof)).toBe(false)
    expect(await verifyMoveProof(await credentialHashOf('other'), address, checked.proof)).toBe(false)
    expect(await verifyMoveProof(stored, address, { ...checked.proof, hqNonce: checked.proof.siteNonce })).toBe(false)
  })

  it('treats the address the same however it is written, and keeps a site tag apart from a host tag', async () => {
    const stored = await credentialHashOf(credential)
    const state = await createMoveChallenge(credential, 'host', 'HTTPS://HQ.acme.example/')
    expect((await checkMoveAnswer(state, await answerMoveChallenge(stored, address, state.challenge))).ok).toBe(true)
    expect(await moveCheckTag(stored, 'site')).not.toBe(await moveCheckTag(stored, 'host'))
  })
})
