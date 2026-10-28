/**
 * The signature check's interface (adr-0158, spec part 3 *The protocol* 3–4). One verifier checks every package's
 * detached Sigstore bundle against the canonical signed statement (core's `signedStatement`), then against the
 * publishers this organisation trusts. It never decides the publisher by itself: the install pipeline takes the
 * publisher from what it returns, never from a manifest.
 */

export type SignerIdentity =
  | { kind: 'keyless'; issuer: string; identity: string; repository: string | null; ref: string | null }
  /** keyId: sha256 hex of the public key's DER (SPKI). */
  | { kind: 'key'; keyId: string }

export type TrustedPublisherRecord = {
  id: string
  name: string
  signerIdentity: string
  signerKind: 'KEYLESS' | 'KEY'
  issuer: string | null
  certificateIdentity: string | null
  repository: string | null
  allowTags: boolean
  allowedBranch: string | null
  publicKey: string | null
}

export type VerifyOutcome =
  | { state: 'trusted'; signer: SignerIdentity; publisher: TrustedPublisherRecord }
  | { state: 'new-publisher'; signer: SignerIdentity }
  | { state: 'unsigned' }
  | { state: 'tampered'; reason: string }
  /** Refused and said plainly: a trust root that expired, a malformed bundle. */
  | { state: 'unverifiable'; reason: string }

export interface SignatureVerifier {
  verify(input: { statement: Uint8Array; bundle: Uint8Array | null; trusted: TrustedPublisherRecord[]; now: Date }): Promise<VerifyOutcome>
  trustRootAge(now: Date): { issuedAt: Date; expired: boolean }
}
