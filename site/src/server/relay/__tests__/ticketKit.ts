/** Tickets signed as hq signs them (RS256, its issuer), with keys made for the test, and a fixed key set source. */
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import {
  FILE_TICKET_TOKEN_TYPE,
  HQ_TOKEN_ISSUER,
  type JsonWebKeySet,
  type LocationRef,
  type PublicJsonWebKey,
  type SiteFileRef,
} from '@agenthix/core'
import type { KeySetSource } from '../hqKeySet'

export type TestKey = { kid: string; privateKey: KeyObject; jwk: PublicJsonWebKey }

export function makeKey(kid: string): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as PublicJsonWebKey
  return { kid, privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } }
}

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

export function signToken(key: TestKey, claims: Record<string, unknown>, header: Record<string, unknown> = {}): string {
  const input = `${b64({ alg: 'RS256', typ: 'JWT', kid: key.kid, ...header })}.${b64(claims)}`
  return `${input}.${sign('sha256', Buffer.from(input), key.privateKey).toString('base64url')}`
}

export const SITE_ID = 'site-1'
export const RELAY_ID = 'relay-1'

/** A ticket's claims for a place's file. */
export function ticketClaims(
  loc: LocationRef,
  filePath: string,
  version: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return fileTicketClaims({ space: 'place', loc, path: filePath }, version, over)
}

/** A ticket's claims for a file in any of the site's spaces. */
export function fileTicketClaims(ref: SiteFileRef, version: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = Math.floor(Date.now() / 1000)
  return {
    iss: HQ_TOKEN_ISSUER,
    aud: SITE_ID,
    iat,
    exp: iat + 300,
    tokenType: FILE_TICKET_TOKEN_TYPE,
    purpose: 'preview',
    ...ref,
    version,
    person: 'person-1',
    site: SITE_ID,
    relay: RELAY_ID,
    ...over,
  }
}

export function fixedKeys(set: JsonWebKeySet, refreshed?: JsonWebKeySet): KeySetSource & { refreshes: number } {
  let current = set
  const source = {
    refreshes: 0,
    get: async () => current,
    refresh: async () => {
      source.refreshes++
      if (!refreshed) return false
      current = refreshed
      return true
    },
  }
  return source
}
