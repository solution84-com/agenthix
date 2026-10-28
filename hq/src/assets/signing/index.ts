import path from 'node:path'
import { getHqAssetsRoot } from '../../server/hqAssets'
import { readTrustRoot } from './trustRoot'
import type { SignatureVerifier } from './types'
import { createSigstoreVerifier } from './verifier'

export type { SignatureVerifier, SignerIdentity, TrustedPublisherRecord, VerifyOutcome } from './types'
export { keyIdOf, parsePublicKey, signerString } from './publishers'

/** The verifier over the trust root hq's image carries; it is read once, on first use. */
export function createVerifier(): SignatureVerifier {
  return createSigstoreVerifier(() => readTrustRoot(path.join(getHqAssetsRoot(), 'sigstore')))
}
