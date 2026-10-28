import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { keyIdOf, parsePublicKey } from '../publishers'
import { createSigstoreVerifier, MAX_BUNDLE_BYTES } from '../verifier'
import { bytes, fixture, keylessRecord, keyRecord, NOW, rootFrom } from './fixtures'

const statement = fixture('statement.txt')
const verifier = createSigstoreVerifier(() => rootFrom('production-trusted_root.json'))

function pemOf(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString()
}

/** A bundle as `cosign sign-blob --key … --bundle … --tlog-upload=false` makes it: no transparency-log entry. */
function keyBundle(privateKey: KeyObject, signed: Uint8Array): Uint8Array {
  return bytes({
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: { publicKey: { hint: '' }, tlogEntries: [], timestampVerificationData: { rfc3161Timestamps: [] } },
    messageSignature: {
      messageDigest: { algorithm: 'SHA2_256', digest: createHash('sha256').update(signed).digest('base64') },
      signature: sign('sha256', signed, privateKey).toString('base64'),
    },
  })
}

function newKey(): { privateKey: KeyObject; pem: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return { privateKey, pem: pemOf(publicKey), keyId: keyIdOf(publicKey) }
}

describe('a key-pair bundle @SC-1614', () => {
  it('is trusted when signed by a trusted key, named by the sha256 of its DER', async () => {
    const key = newKey()
    const record = keyRecord(key.pem, key.keyId)
    const outcome = await verifier.verify({ statement, bundle: keyBundle(key.privateKey, statement), trusted: [record], now: NOW })
    expect(outcome).toEqual({ state: 'trusted', signer: { kind: 'key', keyId: key.keyId }, publisher: record })
    expect(key.keyId).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is unverifiable when signed by a key nobody trusts @security-H2', async () => {
    const signer = newKey()
    const other = newKey()
    const outcome = await verifier.verify({
      statement, bundle: keyBundle(signer.privateKey, statement), trusted: [keyRecord(other.pem, other.keyId), keylessRecord()], now: NOW,
    })
    expect(outcome).toMatchObject({ state: 'unverifiable', reason: expect.stringContaining("isn't among this organisation's trusted keys") })
  })

  it('is tampered when the statement changed after a trusted key signed it', async () => {
    const key = newKey()
    const changed = Buffer.from(statement)
    changed[changed.length - 1] ^= 1
    const outcome = await verifier.verify({ statement: changed, bundle: keyBundle(key.privateKey, statement), trusted: [keyRecord(key.pem, key.keyId)], now: NOW })
    expect(outcome.state).toBe('tampered')
  })

  it('ignores a trusted record whose stored signer string is not its key', async () => {
    const key = newKey()
    const record = keyRecord(key.pem, key.keyId, { signerIdentity: 'key:' + '0'.repeat(64) })
    const outcome = await verifier.verify({ statement, bundle: keyBundle(key.privateKey, statement), trusted: [record], now: NOW })
    expect(outcome.state).toBe('unverifiable')
  })

  it('verifies a real key-pair bundle with its transparency-log entry', async () => {
    const pem = fixture('key-pair.pub').toString('utf8')
    const key = parsePublicKey(pem)!
    const record = keyRecord(pem, keyIdOf(key))
    const outcome = await verifier.verify({ statement, bundle: fixture('key-pair.sigstore.json'), trusted: [record], now: NOW })
    expect(outcome).toEqual({ state: 'trusted', signer: { kind: 'key', keyId: keyIdOf(key) }, publisher: record })
    expect((await verifier.verify({ statement, bundle: fixture('key-pair.sigstore.json'), trusted: [], now: NOW })).state).toBe('unverifiable')
  })
})

describe('any bundle @SC-1614', () => {
  it('is unsigned when there is none', async () => {
    expect(await verifier.verify({ statement, bundle: null, trusted: [keylessRecord()], now: NOW })).toEqual({ state: 'unsigned' })
  })

  it.each([
    ['not JSON', Buffer.from('not json')],
    ['empty', Buffer.alloc(0)],
    ['JSON but not a bundle', bytes({ hello: 'world' })],
    ['too large', Buffer.alloc(MAX_BUNDLE_BYTES + 1, 0x20)],
    ['a DSSE attestation envelope', fixture('dsse.sigstore.json')],
  ])('is unverifiable when it is %s', async (_, bundle) => {
    expect((await verifier.verify({ statement, bundle, trusted: [keylessRecord()], now: NOW })).state).toBe('unverifiable')
  })

  it('is unverifiable when hq has no usable trust root, and still says unsigned without a bundle', async () => {
    const broken = createSigstoreVerifier(() => { throw new Error('no such file') })
    const outcome = await broken.verify({ statement, bundle: fixture('keyless.sigstore.json'), trusted: [keylessRecord()], now: NOW })
    expect(outcome).toMatchObject({ state: 'unverifiable', reason: expect.stringContaining('trust root') })
    expect((await broken.verify({ statement, bundle: null, trusted: [], now: NOW })).state).toBe('unsigned')
    expect(broken.trustRootAge(NOW).expired).toBe(true)
  })
})
