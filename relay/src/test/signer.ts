/** Signs tokens the way hq does (RS256 with a key id), with a key made for the test. */
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import {
  FILE_TICKET_TTL_SECONDS, HQ_TOKEN_ISSUER, RELAY_PASS_TTL_SECONDS, type JsonWebKeySet, type PublicJsonWebKey,
} from '@agenthix/core'

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

export type Signer = { kid: string; keys: JsonWebKeySet; sign(payload: Record<string, unknown>): string }

export function makeSigner(kid = 'hq-key-1'): Signer {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = (publicKey as KeyObject).export({ format: 'jwk' }) as { kty: string; n: string; e: string }
  const pub: PublicJsonWebKey = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' }
  return {
    kid,
    keys: { keys: [pub] },
    sign(payload) {
      const input = `${b64({ alg: 'RS256', kid })}.${b64(payload)}`
      const sig = createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')
      return `${input}.${sig}`
    },
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

export function passClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = nowSeconds()
  return { iss: HQ_TOKEN_ISSUER, aud: 'relay-1', sub: 'site-1', iat, exp: iat + RELAY_PASS_TTL_SECONDS, tokenType: 'relay-pass', ...over }
}

export function ticketClaims(over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = nowSeconds()
  return {
    iss: HQ_TOKEN_ISSUER, aud: 'site-1', iat, exp: iat + FILE_TICKET_TTL_SECONDS, tokenType: 'file-ticket',
    purpose: 'preview', space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, path: 'reports/q3.pdf',
    version: '2048:1799999000000', person: 'person-1', site: 'site-1', relay: 'relay-1', ...over,
  }
}

/** An upload's ticket: served by the relay itself, so its audience and relay are the relay's id and it names no site. */
export function uploadTicketClaims(path: string, version: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = nowSeconds()
  return {
    iss: HQ_TOKEN_ISSUER, aud: 'relay-1', iat, exp: iat + FILE_TICKET_TTL_SECONDS, tokenType: 'file-ticket',
    purpose: 'preview', space: 'upload', path, version, person: 'person-1', relay: 'relay-1', ...over,
  }
}
