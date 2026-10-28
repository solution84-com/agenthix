/**
 * Checks a package's detached Sigstore bundle over its signed statement, offline, with sigstore-js's verifier
 * (adr-0158; spec part 3, *The protocol* 3–4). The bundle is a message signature over the statement's bytes, the form
 * `cosign sign-blob --bundle` and sigstore-js's `sign` make for a blob; a DSSE envelope is refused.
 *
 * - Keyless: the certificate must chain to Sigstore's certificate authority, carry a certificate-transparency proof,
 *   and the signature must be in Sigstore's transparency log with an inclusion proof checked against the log's signed
 *   checkpoint (a signed promise alone is not enough). The signer is then matched against the trusted publishers
 *   exactly (`publishers.ts`).
 * - Key pair: only the organisation's trusted keys are tried; a transparency-log entry is checked if present but not
 *   required. A key nobody added can't be checked at all, so that bundle is unverifiable, not a new publisher.
 *
 * Nothing here reaches the network.
 */
import { createHash } from 'node:crypto'
import { bundleFromJSON, type Bundle } from '@sigstore/bundle'
import { X509Certificate } from '@sigstore/core'
import { HashAlgorithm } from '@sigstore/protobuf-specs'
import { toSignedEntity, toTrustMaterial, VerificationError, Verifier } from '@sigstore/verify'
import { keylessSigner } from './certificate'
import { matchKeyless, trustedKeys } from './publishers'
import { trustRootExpired, TRUST_ROOT_MAX_AGE_DAYS, type LoadedTrustRoot } from './trustRoot'
import type { SignatureVerifier, TrustedPublisherRecord, VerifyOutcome } from './types'

/** A real bundle is a few kilobytes. */
export const MAX_BUNDLE_BYTES = 256 * 1024

type Unverifiable = Extract<VerifyOutcome, { state: 'unverifiable' }>
const unverifiable = (reason: string): Unverifiable => ({ state: 'unverifiable', reason })

function day(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseBundle(bytes: Uint8Array): Bundle | Unverifiable {
  if (bytes.byteLength > MAX_BUNDLE_BYTES) return unverifiable('The signature file is too large to be a Sigstore bundle.')
  try {
    return bundleFromJSON(JSON.parse(Buffer.from(bytes).toString('utf8')))
  } catch {
    return unverifiable("The signature file isn't a Sigstore bundle this HQ can read.")
  }
}

function failure(err: unknown): VerifyOutcome {
  if (err instanceof VerificationError && err.code === 'SIGNATURE_ERROR') {
    return { state: 'tampered', reason: "The signature doesn't match the package's contents." }
  }
  const detail = err instanceof Error ? err.message : String(err)
  return unverifiable(`The signature couldn't be checked against Sigstore's records: ${detail}.`)
}

export function createSigstoreVerifier(load: () => LoadedTrustRoot): SignatureVerifier {
  let loaded: LoadedTrustRoot | Error | null = null
  const trustRoot = (): LoadedTrustRoot | Error => {
    if (loaded === null) {
      try {
        loaded = load()
      } catch (err) {
        loaded = err instanceof Error ? err : new Error(String(err))
      }
    }
    return loaded
  }

  function verifyKeyless(bundle: Bundle, statement: Buffer, root: LoadedTrustRoot, trusted: TrustedPublisherRecord[], now: Date): VerifyOutcome {
    if (trustRootExpired(root.issuedAt, now)) {
      return unverifiable(
        `This HQ's copy of Sigstore's trust root was issued on ${day(root.issuedAt)} and is more than ` +
          `${TRUST_ROOT_MAX_AGE_DAYS} days old, so signatures can't be checked. Update HQ to get a current one.`,
      )
    }
    const entries = bundle.verificationMaterial.tlogEntries
    if (entries.length === 0 || entries.some(entry => !entry.inclusionProof?.checkpoint)) {
      return unverifiable("The signature has no proof that it is in Sigstore's transparency log, so it can't be checked offline.")
    }
    try {
      new Verifier(toTrustMaterial(root.root)).verify(toSignedEntity(bundle, statement))
    } catch (err) {
      return failure(err)
    }
    const material = bundle.verificationMaterial.content
    const raw = material.$case === 'certificate' ? material.certificate.rawBytes
      : material.$case === 'x509CertificateChain' ? material.x509CertificateChain.certificates[0]?.rawBytes : undefined
    const signer = raw ? keylessSigner(X509Certificate.parse(Buffer.from(raw))) : null
    if (!signer) return unverifiable("The signing certificate doesn't say who signed it.")
    const publisher = matchKeyless(signer, trusted)
    return publisher ? { state: 'trusted', signer, publisher } : { state: 'new-publisher', signer }
  }

  function verifyWithKeys(bundle: Bundle, statement: Buffer, root: LoadedTrustRoot, trusted: TrustedPublisherRecord[]): VerifyOutcome {
    let lastFailure: VerifyOutcome | null = null
    for (const { record, key, keyId } of trustedKeys(trusted)) {
      const material = toTrustMaterial(root.root, () => ({ publicKey: key, validFor: () => true }))
      try {
        new Verifier(material, { tlogThreshold: 0, ctlogThreshold: 0, timestampThreshold: 0 }).verify(toSignedEntity(bundle, statement))
        return { state: 'trusted', signer: { kind: 'key', keyId }, publisher: record }
      } catch (err) {
        if (!(err instanceof VerificationError && err.code === 'SIGNATURE_ERROR')) lastFailure = failure(err)
      }
    }
    return lastFailure ?? unverifiable(
      "This was signed with a key that isn't among this organisation's trusted keys, so the signature can't be " +
        "checked. Add the publisher's public key to trusted publishers to install it as theirs.",
    )
  }

  return {
    trustRootAge(now) {
      const root = trustRoot()
      if (root instanceof Error) return { issuedAt: new Date(0), expired: true }
      return { issuedAt: root.issuedAt, expired: trustRootExpired(root.issuedAt, now) }
    },

    async verify({ statement, bundle: bundleBytes, trusted, now }) {
      if (bundleBytes === null) return { state: 'unsigned' }
      const bundle = parseBundle(bundleBytes)
      if ('state' in bundle) return bundle
      if (bundle.content.$case !== 'messageSignature') {
        return unverifiable("The signature is an attestation envelope, not a signature over the package's statement.")
      }
      const { messageDigest } = bundle.content.messageSignature
      if (messageDigest.algorithm !== HashAlgorithm.SHA2_256) {
        return unverifiable('The signature uses a digest other than SHA-256, which this HQ does not accept.')
      }
      const content = Buffer.from(statement)
      if (!createHash('sha256').update(content).digest().equals(Buffer.from(messageDigest.digest))) {
        return { state: 'tampered', reason: 'The package was changed after it was signed.' }
      }
      const root = trustRoot()
      if (root instanceof Error) {
        return unverifiable(`This HQ has no usable copy of Sigstore's trust root (${root.message}), so signatures can't be checked.`)
      }
      return bundle.verificationMaterial.content.$case === 'publicKey'
        ? verifyWithKeys(bundle, content, root, trusted)
        : verifyKeyless(bundle, content, root, trusted, now)
    },
  }
}
