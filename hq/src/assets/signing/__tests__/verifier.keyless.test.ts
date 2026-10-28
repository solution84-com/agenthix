import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readTrustRoot } from '../trustRoot'
import { createSigstoreVerifier } from '../verifier'
import {
  BEACON_IDENTITY, BEACON_REPOSITORY, bytes, fixture, fixtureJson, GITHUB_ISSUER, ISSUED_AT, keylessRecord, NOW, rootFrom,
} from './fixtures'

const statement = fixture('statement.txt')
const bundle = fixture('keyless.sigstore.json')
const verifier = createSigstoreVerifier(() => rootFrom('production-trusted_root.json'))

const SIGNER = {
  kind: 'keyless',
  issuer: GITHUB_ISSUER,
  identity: BEACON_IDENTITY,
  repository: BEACON_REPOSITORY,
  ref: 'refs/heads/main',
}

describe('a keyless bundle @SC-1614', () => {
  it('is trusted when issuer, identity, repository and branch match a trusted publisher', async () => {
    const record = keylessRecord()
    const outcome = await verifier.verify({ statement, bundle, trusted: [record], now: NOW })
    expect(outcome).toEqual({ state: 'trusted', signer: SIGNER, publisher: record })
  })

  it('is a new publisher when nobody trusts its signer', async () => {
    expect(await verifier.verify({ statement, bundle, trusted: [], now: NOW }))
      .toEqual({ state: 'new-publisher', signer: SIGNER })
  })

  it('is a new publisher when it was signed from a branch the publisher does not allow @security-H2', async () => {
    const trusted = [keylessRecord({ allowedBranch: 'release' }), keylessRecord({ allowTags: true, allowedBranch: null })]
    expect((await verifier.verify({ statement, bundle, trusted, now: NOW })).state).toBe('new-publisher')
  })

  it.each([
    ['a prefix of the identity', { certificateIdentity: `${BEACON_REPOSITORY}/` }],
    ['a wildcard identity', { certificateIdentity: `${BEACON_REPOSITORY}/.github/workflows/*` }],
    ['a regular expression', { certificateIdentity: '.*' }],
    ['the identity in another case', { certificateIdentity: BEACON_IDENTITY.toUpperCase() }],
    ['the identity with its ref, which is checked on its own', { certificateIdentity: `${BEACON_IDENTITY}@refs/heads/main` }],
    ['another issuer', { issuer: 'https://accounts.google.com' }],
    ['a repository with a trailing slash', { repository: `${BEACON_REPOSITORY}/` }],
    ['no repository, as for a person', { repository: null }],
    ['a stored signer string that disagrees', { signerIdentity: 'keyless:https://example.com#someone' }],
    ['a key-pair record', { signerKind: 'KEY' as const }],
  ])('does not match a record with %s', async (_, overrides) => {
    const outcome = await verifier.verify({ statement, bundle, trusted: [keylessRecord(overrides)], now: NOW })
    expect(outcome.state).toBe('new-publisher')
  })

  it('is tampered when the statement changed by one byte', async () => {
    const changed = Buffer.from(statement)
    changed[0] ^= 1
    const outcome = await verifier.verify({ statement: changed, bundle, trusted: [keylessRecord()], now: NOW })
    expect(outcome.state).toBe('tampered')
  })

  it('is refused when its digest was changed to the new statement but the signature was not', async () => {
    const changed = Buffer.concat([statement, Buffer.from('!')])
    const json = fixtureJson('keyless.sigstore.json') as { messageSignature: { messageDigest: { digest: string } } }
    json.messageSignature.messageDigest.digest = createHash('sha256').update(changed).digest('base64')
    const outcome = await verifier.verify({ statement: changed, bundle: bytes(json), trusted: [keylessRecord()], now: NOW })
    expect(['tampered', 'unverifiable']).toContain(outcome.state)
  })

  it('is unverifiable without an inclusion proof, even with the log’s signed promise @security-H2', async () => {
    const json = fixtureJson('keyless.sigstore.json') as {
      mediaType: string; verificationMaterial: { tlogEntries: { inclusionProof?: unknown }[]; certificate?: unknown; x509CertificateChain?: unknown }
    }
    // A version 0.1 bundle may carry only the promise, so this one still parses.
    json.mediaType = 'application/vnd.dev.sigstore.bundle+json;version=0.1'
    json.verificationMaterial.x509CertificateChain = { certificates: [json.verificationMaterial.certificate] }
    delete json.verificationMaterial.certificate
    for (const entry of json.verificationMaterial.tlogEntries) delete entry.inclusionProof
    const outcome = await verifier.verify({ statement, bundle: bytes(json), trusted: [keylessRecord()], now: NOW })
    expect(outcome).toMatchObject({ state: 'unverifiable', reason: expect.stringContaining('transparency log') })
  })

  it('is unverifiable with no transparency-log entry at all', async () => {
    const json = fixtureJson('keyless.sigstore.json') as { verificationMaterial: { tlogEntries: unknown[] } }
    json.verificationMaterial.tlogEntries = []
    const outcome = await verifier.verify({ statement, bundle: bytes(json), trusted: [keylessRecord()], now: NOW })
    expect(outcome.state).toBe('unverifiable')
  })

  it('is unverifiable against an expired trust root, and the root says so @security-M4', async () => {
    const later = new Date(new Date(ISSUED_AT).getTime() + 366 * 24 * 60 * 60 * 1000)
    const outcome = await verifier.verify({ statement, bundle, trusted: [keylessRecord()], now: later })
    expect(outcome).toMatchObject({ state: 'unverifiable', reason: expect.stringContaining('2026-10-27') })
    expect(verifier.trustRootAge(later)).toEqual({ issuedAt: new Date(ISSUED_AT), expired: true })
    expect(verifier.trustRootAge(NOW)).toEqual({ issuedAt: new Date(ISSUED_AT), expired: false })
  })

  it('verifies a Rekor v2 entry with a timestamp authority’s timestamp', async () => {
    const staging = createSigstoreVerifier(() => rootFrom('rekor2-trusted_root.json'))
    const outcome = await staging.verify({ statement, bundle: fixture('keyless-rekor2.sigstore.json'), trusted: [keylessRecord()], now: NOW })
    expect(outcome.state).toBe('trusted')
  })

  it('is unverifiable against a trust root that does not know its log', async () => {
    const outcome = await verifier.verify({ statement, bundle: fixture('keyless-rekor2.sigstore.json'), trusted: [], now: NOW })
    expect(outcome.state).toBe('unverifiable')
  })

  it('verifies against the trust root hq ships', async () => {
    const dir = fileURLToPath(new URL('../../../../assets/sigstore', import.meta.url))
    const shipped = createSigstoreVerifier(() => readTrustRoot(dir))
    const now = shipped.trustRootAge(new Date(0)).issuedAt
    expect((await shipped.verify({ statement, bundle, trusted: [keylessRecord()], now })).state).toBe('trusted')
  })
})
