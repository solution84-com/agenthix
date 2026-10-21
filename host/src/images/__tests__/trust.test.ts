/**
 * The host service trusts a list of publishers — a registry and image names, and the workflow that signs them — so
 * a release can publish under two names and be trusted under both. Each entry is checked exactly as strictly as the
 * one signer was: the exact identity at the version's tag, and the exact issuer.
 */
import { describe, expect, it } from 'vitest'
import { checkTrusted } from '../images'
import { signerFor, TRUSTED_PUBLISHERS, trustedSigners, type Signer, type TrustedPublisher } from '../published'
import type { SignatureCheck } from '../signatures'

const DIGEST = `sha256:${'ab'.repeat(32)}`
const ISSUER = 'https://token.actions.githubusercontent.com'

const first: TrustedPublisher = {
  registry: 'ghcr.io/first-owner', imagePrefix: 'first', repository: 'https://github.com/first-owner/first',
  workflow: '.github/workflows/publish-images.yml', issuer: ISSUER,
}
const second: TrustedPublisher = {
  registry: 'ghcr.io/second-owner', imagePrefix: 'second', repository: 'https://github.com/second-owner/second',
  workflow: '.github/workflows/release.yml', issuer: ISSUER,
}
const both = [first, second] as const

/** A cosign stand-in: the image is signed by exactly `by`, and every check is recorded. */
function signedBy(by: Signer | null) {
  const asked: Signer[] = []
  const check = async (_ref: string, signer: Signer): Promise<SignatureCheck> => {
    asked.push(signer)
    if (!by) return { kind: 'unsigned' }
    return signer.identity === by.identity && signer.issuer === by.issuer ? { kind: 'signed', digest: DIGEST } : { kind: 'wrongSigner' }
  }
  return { check, asked }
}

describe('the publishers the host service trusts @SC-820', () => {
  it('is one entry today: this repository’s publishing workflow, its registry and its image names', () => {
    expect(TRUSTED_PUBLISHERS).toEqual([{
      registry: 'ghcr.io/solution84-com', imagePrefix: 'agenthix', repository: 'https://github.com/solution84-com/agenthix',
      workflow: '.github/workflows/publish-images.yml', issuer: ISSUER,
    }])
    expect(trustedSigners('ghcr.io/solution84-com/agenthix-host:0.2.0', '0.2.0')).toEqual([{
      identity: 'https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v0.2.0', issuer: ISSUER,
    }])
  })

  it('names, for an image, only the signers of the entries whose names it carries, at that version’s tag', () => {
    expect(trustedSigners('ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', both)).toEqual([signerFor('1.0.0', first)])
    expect(trustedSigners('ghcr.io/second-owner/second-agent@' + DIGEST, '1.0.0', both)).toEqual([signerFor('1.0.0', second)])
    expect(signerFor('1.0.0', second)).toEqual({ identity: 'https://github.com/second-owner/second/.github/workflows/release.yml@refs/tags/v1.0.0', issuer: ISSUER })
  })

  it('names no signer for an image name outside the list', () => {
    for (const ref of [
      'ghcr.io/first-owner/second-agent:1.0.0', // another entry's name in this entry's registry
      'ghcr.io/elsewhere/first-agent:1.0.0',
      'ghcr.io/first-owner/first-unknown:1.0.0', // not a part that is published
      'ghcr.io/first-owner/first-agent-extra:1.0.0',
      'first-agent',
    ]) expect(trustedSigners(ref, '1.0.0', both)).toEqual([])
  })

  it('accepts an image signed by the first entry', async () => {
    const cosign = signedBy(signerFor('1.0.0', first))
    expect(await checkTrusted(cosign.check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'signed', digest: DIGEST })
    expect(cosign.asked).toEqual([signerFor('1.0.0', first)])
  })

  it('accepts an image signed by another entry, when it carries that entry’s name', async () => {
    const cosign = signedBy(signerFor('1.0.0', second))
    expect(await checkTrusted(cosign.check, 'ghcr.io/second-owner/second-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'signed', digest: DIGEST })
  })

  it('accepts an image two entries share the name of, signed by either', async () => {
    const renamed: TrustedPublisher = { ...first, repository: 'https://github.com/first-owner/renamed' }
    const cosign = signedBy(signerFor('1.0.0', renamed))
    expect(await checkTrusted(cosign.check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', [first, renamed])).toEqual({ kind: 'signed', digest: DIGEST })
    expect(cosign.asked).toEqual([signerFor('1.0.0', first), signerFor('1.0.0', renamed)])
  })

  it('refuses an image signed by neither entry', async () => {
    const stranger: Signer = { identity: 'https://github.com/someone/else/.github/workflows/x.yml@refs/tags/v1.0.0', issuer: ISSUER }
    expect(await checkTrusted(signedBy(stranger).check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'wrongSigner' })
    const otherTag = signerFor('1.0.1', first)
    expect(await checkTrusted(signedBy(otherTag).check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'wrongSigner' })
    const otherIssuer = { ...signerFor('1.0.0', first), issuer: 'https://issuer.example' }
    expect(await checkTrusted(signedBy(otherIssuer).check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'wrongSigner' })
  })

  it('refuses an image name outside the list without checking it', async () => {
    const cosign = signedBy(signerFor('1.0.0', first))
    expect(await checkTrusted(cosign.check, 'ghcr.io/elsewhere/first-agent:1.0.0', '1.0.0', both)).toEqual({ kind: 'untrusted' })
    expect(cosign.asked).toEqual([])
  })

  it('stops at an answer that holds whoever the signer is: unsigned, missing, or not checked', async () => {
    for (const answer of [{ kind: 'unsigned' }, { kind: 'missing' }, { kind: 'unchecked', reason: 'no network' }] as const) {
      const asked: Signer[] = []
      const check = async (_ref: string, signer: Signer): Promise<SignatureCheck> => { asked.push(signer); return answer }
      const shared: TrustedPublisher = { ...first, repository: 'https://github.com/first-owner/renamed' }
      expect(await checkTrusted(check, 'ghcr.io/first-owner/first-agent:1.0.0', '1.0.0', [first, shared])).toEqual(answer)
      expect(asked).toHaveLength(1)
    }
  })
})
