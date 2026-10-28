/**
 * The canonical signer string stored in every `signerIdentity` column, and a trusted publisher's row as the verifier
 * reads it. A keyless signer is its issuer and exact certificate identity; a key is its fingerprint. Two signers are
 * the same only when these strings are equal.
 */
import { signerString } from './publishers'
import type { SignerIdentity, TrustedPublisherRecord } from './types'

export const canonicalSigner = signerString

type TrustedPublisherRow = Omit<TrustedPublisherRecord, 'signerKind'> & { signerKind: string }

/** A stored publisher as the verifier's record; null for one whose kind isn't a signature (never stored). */
export function trustedPublisherRecord(row: TrustedPublisherRow): TrustedPublisherRecord | null {
  if (row.signerKind !== 'KEYLESS' && row.signerKind !== 'KEY') return null
  const { id, name, signerIdentity, signerKind, issuer, certificateIdentity, repository, allowTags, allowedBranch, publicKey } = row
  return { id, name, signerIdentity, signerKind, issuer, certificateIdentity, repository, allowTags, allowedBranch, publicKey }
}

/** What a person reads about a signer: what it proves, never more (spec part 3 *Who signs*). */
export function describeSigner(signer: SignerIdentity): string {
  if (signer.kind === 'key') return `a key with the fingerprint ${signer.keyId.slice(0, 16)}…`
  if (signer.repository) return `${signer.repository}${signer.ref ? ` (${signer.ref})` : ''}`
  return `a person, ${signer.identity} (${signer.issuer}), not an organisation`
}
