import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseTrustRoot, type LoadedTrustRoot } from '../trustRoot'
import type { TrustedPublisherRecord } from '../types'

export const fixturePath = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
export const fixture = (name: string): Buffer => readFileSync(fixturePath(name))
export const fixtureJson = (name: string): Record<string, unknown> => JSON.parse(fixture(name).toString('utf8'))
export const bytes = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value))

/** The day the fixture root was fetched; checks in the tests run the day after. */
export const ISSUED_AT = '2026-10-27T08:49:36.708Z'
export const NOW = new Date('2026-10-28T00:00:00Z')

export function rootFrom(name: string, issuedAt = ISSUED_AT): LoadedTrustRoot {
  return parseTrustRoot(fixture(name).toString('utf8'), JSON.stringify({ issuedAt }))
}

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com'
export const BEACON_REPOSITORY = 'https://github.com/sigstore-conformance/extremely-dangerous-public-oidc-beacon'
/** The fixture's certificate identity without its `@refs/heads/main`. */
export const BEACON_IDENTITY = `${BEACON_REPOSITORY}/.github/workflows/extremely-dangerous-oidc-beacon.yml`

export function keylessRecord(overrides: Partial<TrustedPublisherRecord> = {}): TrustedPublisherRecord {
  const issuer = overrides.issuer ?? GITHUB_ISSUER
  const certificateIdentity = overrides.certificateIdentity ?? BEACON_IDENTITY
  return {
    id: 'publisher-1',
    name: 'conformance',
    signerIdentity: `keyless:${issuer}#${certificateIdentity}`,
    signerKind: 'KEYLESS',
    issuer,
    certificateIdentity,
    repository: BEACON_REPOSITORY,
    allowTags: false,
    allowedBranch: 'main',
    publicKey: null,
    ...overrides,
  }
}

export function keyRecord(publicKey: string, keyId: string, overrides: Partial<TrustedPublisherRecord> = {}): TrustedPublisherRecord {
  return {
    id: 'publisher-key',
    name: 'acme',
    signerIdentity: `key:${keyId}`,
    signerKind: 'KEY',
    issuer: null,
    certificateIdentity: null,
    repository: null,
    allowTags: false,
    allowedBranch: null,
    publicKey,
    ...overrides,
  }
}
