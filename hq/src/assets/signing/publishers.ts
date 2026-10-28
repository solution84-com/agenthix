/**
 * Who a verified signer is, as the organisation's trusted publishers name it (spec part 3, *Who signs*; security
 * review H2). Everything here compares exactly: no pattern, prefix or case folding.
 */
import { createHash, createPublicKey, type KeyObject } from 'node:crypto'
import type { SignerIdentity, TrustedPublisherRecord } from './types'

/** The string stored in `signerIdentity` columns: `keyless:<issuer>#<identity>` or `key:<keyId>`. */
export function signerString(signer: SignerIdentity): string {
  return signer.kind === 'keyless' ? `keyless:${signer.issuer}#${signer.identity}` : `key:${signer.keyId}`
}

/** A public key from PEM (SPKI); null when it is not one. */
export function parsePublicKey(pem: string): KeyObject | null {
  try {
    const key = createPublicKey({ key: pem, format: 'pem' })
    return key.type === 'public' ? key : null
  } catch {
    return null
  }
}

/** sha256 hex of the key's DER (SPKI) encoding. */
export function keyIdOf(key: KeyObject): string {
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')
}

/**
 * Whether a certificate's ref is one the record lets sign: a tag when `allowTags`, otherwise only
 * `refs/heads/<allowedBranch>`. A feature branch, a pull request's merge ref or no ref at all never is.
 */
export function refAllowed(ref: string | null, record: Pick<TrustedPublisherRecord, 'allowTags' | 'allowedBranch'>): boolean {
  if (ref === null) return false
  if (record.allowTags && ref.startsWith('refs/tags/') && ref.length > 'refs/tags/'.length) return true
  return !!record.allowedBranch && ref === `refs/heads/${record.allowedBranch}`
}

/**
 * The trusted keyless publisher this signer is, if any. Issuer, identity and repository must equal the record's
 * exactly, and the record's own `signerIdentity` must be this signer's string. A signer from a repository (a CI
 * workflow) must also have signed from a ref the record allows. A signer with no repository (a person's identity)
 * is bound by issuer and identity alone, and must carry no ref.
 */
export function matchKeyless(
  signer: Extract<SignerIdentity, { kind: 'keyless' }>,
  trusted: TrustedPublisherRecord[],
): TrustedPublisherRecord | null {
  const canonical = signerString(signer)
  for (const record of trusted) {
    if (record.signerKind !== 'KEYLESS' || record.signerIdentity !== canonical) continue
    if (record.issuer !== signer.issuer || record.certificateIdentity !== signer.identity) continue
    if (record.repository !== signer.repository) continue
    if (signer.repository === null ? signer.ref === null : refAllowed(signer.ref, record)) return record
  }
  return null
}

/**
 * The organisation's trusted key-pair publishers with a usable key. A record whose stored `signerIdentity` is not
 * `key:<sha256 of its key>` is skipped: what it claims and what it holds disagree.
 */
export function trustedKeys(trusted: TrustedPublisherRecord[]): { record: TrustedPublisherRecord; key: KeyObject; keyId: string }[] {
  const keys: { record: TrustedPublisherRecord; key: KeyObject; keyId: string }[] = []
  for (const record of trusted) {
    if (record.signerKind !== 'KEY' || !record.publicKey) continue
    const key = parsePublicKey(record.publicKey)
    if (!key) continue
    const keyId = keyIdOf(key)
    if (record.signerIdentity === `key:${keyId}`) keys.push({ record, key, keyId })
  }
  return keys
}
