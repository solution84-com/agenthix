/**
 * Sigstore's trust root as hq's image carries it (`assets/sigstore/`): `trusted_root.json`, fetched from Sigstore's
 * public TUF repository at release by `scripts/sigstore/refresh-trust-root.mjs`, and `issued.json` beside it, the
 * date it was fetched. Checking against it needs no network.
 */
import fs from 'node:fs'
import path from 'node:path'
import { TrustedRoot } from '@sigstore/protobuf-specs'

/**
 * How long a shipped root is used. Sigstore adds and retires its signing keys and logs from time to time; a root
 * older than this may trust a key Sigstore has since retired, or not know the log a new signature is in, so a check
 * against it is refused until hq is updated.
 */
export const TRUST_ROOT_MAX_AGE_DAYS = 365

export type LoadedTrustRoot = { root: TrustedRoot; issuedAt: Date }

export function parseTrustRoot(rootJson: string, issuedJson: string): LoadedTrustRoot {
  const issued = JSON.parse(issuedJson) as { issuedAt?: unknown }
  const issuedAt = typeof issued.issuedAt === 'string' ? new Date(issued.issuedAt) : new Date(NaN)
  if (Number.isNaN(issuedAt.getTime())) throw new Error('issued.json has no valid issuedAt')
  const root = TrustedRoot.fromJSON(JSON.parse(rootJson))
  if (root.tlogs.length === 0 || root.certificateAuthorities.length === 0) {
    throw new Error('trusted_root.json has no transparency logs or certificate authorities')
  }
  return { root, issuedAt }
}

export function readTrustRoot(dir: string): LoadedTrustRoot {
  return parseTrustRoot(
    fs.readFileSync(path.join(dir, 'trusted_root.json'), 'utf8'),
    fs.readFileSync(path.join(dir, 'issued.json'), 'utf8'),
  )
}

export function trustRootExpired(issuedAt: Date, now: Date): boolean {
  return now.getTime() - issuedAt.getTime() > TRUST_ROOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}
