import { describe, expect, it } from 'vitest'
import { checkSignature, classify, signedDigest, verifyArgs, type CosignRunner } from '../signatures'
import { signerFor } from '../published'

const DIGEST = `sha256:${'ab'.repeat(32)}`
const payload = (digest: string) => ({ critical: { identity: { 'docker-reference': 'ghcr.io/x/y' }, image: { 'docker-manifest-digest': digest }, type: 'cosign container image signature' }, optional: null })
const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' })
const failed = (stderr: string, code = 1) => ({ code, stdout: '', stderr })

describe('checking a signature with cosign @SC-820 @SC-1052', () => {
  it('names the one signer expected for the version, and the issuer of GitHub Actions’ tokens', () => {
    expect(signerFor('0.2.0').identity).toBe('https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v0.2.0')
    expect(verifyArgs('ghcr.io/solution84-com/agenthix-host:0.2.0', signerFor('0.2.0'))).toEqual([
      'verify',
      '--certificate-identity', 'https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v0.2.0',
      '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
      'ghcr.io/solution84-com/agenthix-host:0.2.0',
    ])
  })

  it('names a pre-release’s own tag as the signer, not the release’s', () => {
    expect(signerFor('1.0.0-beta.2').identity).toBe('https://github.com/solution84-com/agenthix/.github/workflows/publish-images.yml@refs/tags/v1.0.0-beta.2')
    expect(signerFor('1.0.0-rc.1').identity).toContain('@refs/tags/v1.0.0-rc.1')
  })

  it('reads back the digest the signatures cover', async () => {
    const run: CosignRunner = async args => {
      expect(args[0]).toBe('verify')
      return ok(`${JSON.stringify([payload(DIGEST), payload(DIGEST)])}\n`)
    }
    expect(await checkSignature(run, 'ghcr.io/x/y:0.2.0', signerFor('0.2.0'))).toEqual({ kind: 'signed', digest: DIGEST })
  })

  it('does not take a pass that names no digest, or more than one, as signed', () => {
    expect(signedDigest('')).toBeNull()
    expect(signedDigest('[]')).toBeNull()
    expect(signedDigest('not json')).toBeNull()
    expect(signedDigest(JSON.stringify([payload('sha256:short')]))).toBeNull()
    expect(signedDigest(JSON.stringify([payload(DIGEST), payload(`sha256:${'cd'.repeat(32)}`)]))).toBeNull()
    expect(classify(ok('[]'))).toMatchObject({ kind: 'unchecked' })
  })

  it('tells an unsigned image from one signed by someone else', () => {
    expect(classify(failed('Error: no signatures found\nmain.go:74: error during command execution: no signatures found'))).toEqual({ kind: 'unsigned' })
    expect(classify(failed('Error: no matching signatures: none of the expected identities matched what was in the certificate, got subjects [https://github.com/someone/else/.github/workflows/x.yml@refs/heads/main]'))).toEqual({ kind: 'wrongSigner' })
  })

  it('says when the registry has no such image', () => {
    expect(classify(failed('Error: GET https://ghcr.io/v2/x/y/manifests/9.9.9: MANIFEST_UNKNOWN: manifest unknown'))).toEqual({ kind: 'missing' })
  })

  it('fails closed when the check cannot be made, saying why', () => {
    expect(classify(failed('Error: getting Rekor public keys: dial tcp: lookup rekor.sigstore.dev: no such host'))).toEqual({
      kind: 'unchecked', reason: 'getting Rekor public keys: dial tcp: lookup rekor.sigstore.dev: no such host',
    })
    expect(classify(failed('spawn cosign ENOENT', 127))).toMatchObject({ kind: 'unchecked', reason: expect.stringMatching(/no cosign/) })
    expect(classify(failed('', 2))).toEqual({ kind: 'unchecked', reason: 'cosign stopped with code 2' })
  })
})
