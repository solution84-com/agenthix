/**
 * The keyless signer a verified Fulcio certificate names, read from its extensions
 * (https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md).
 */
import { X509Certificate } from '@sigstore/core'
import type { SignerIdentity } from './types'

const OID_ISSUER_V1 = '1.3.6.1.4.1.57264.1.1'
const OID_ISSUER_V2 = '1.3.6.1.4.1.57264.1.8'
const OID_SOURCE_REPOSITORY_URI = '1.3.6.1.4.1.57264.1.12'
const OID_SOURCE_REPOSITORY_REF = '1.3.6.1.4.1.57264.1.14'
const UTF8_STRING = 12

/** A v2 extension holds a DER UTF8String; anything else reads as absent. */
function derString(cert: X509Certificate, oid: string): string | null {
  const sub = cert.extension(oid)?.valueObj.subs[0]
  if (!sub || sub.tag.number !== UTF8_STRING) return null
  const value = sub.value.toString('utf8')
  return value.length > 0 ? value : null
}

/** The legacy issuer extension holds the bare string. */
function rawString(cert: X509Certificate, oid: string): string | null {
  const value = cert.extension(oid)?.value.toString('utf8')
  return value ? value : null
}

/**
 * A CI workflow's certificate identity ends with `@<the ref it ran from>` (GitHub's
 * `…/.github/workflows/release.yml@refs/tags/v1.2.0`). The ref is checked on its own, from the source-repository-ref
 * extension, so the identity a publisher is recorded and matched by is the identity without that exact suffix. It is
 * removed only when it equals the certificate's own source ref; any other identity is kept whole.
 */
export function identityWithoutRef(subjectAltName: string, ref: string | null): string {
  if (ref === null) return subjectAltName
  const suffix = `@${ref}`
  return subjectAltName.endsWith(suffix) && subjectAltName.length > suffix.length
    ? subjectAltName.slice(0, -suffix.length)
    : subjectAltName
}

export function keylessSigner(cert: X509Certificate): Extract<SignerIdentity, { kind: 'keyless' }> | null {
  const issuer = derString(cert, OID_ISSUER_V2) ?? rawString(cert, OID_ISSUER_V1)
  const subjectAltName = cert.subjectAltName
  if (!issuer || !subjectAltName) return null
  const repository = derString(cert, OID_SOURCE_REPOSITORY_URI)
  const ref = derString(cert, OID_SOURCE_REPOSITORY_REF)
  return { kind: 'keyless', issuer, identity: identityWithoutRef(subjectAltName, ref), repository, ref }
}
