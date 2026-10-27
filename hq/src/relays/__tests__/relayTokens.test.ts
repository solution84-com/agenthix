import { describe, it, expect, vi, beforeAll } from 'vitest'
import { generateKeyPair, exportJWK, calculateJwkThumbprint, type CryptoKey } from 'jose'
import {
  verifyRelayToken, FILE_TICKET_TOKEN_TYPE, RELAY_PASS_TOKEN_TYPE, FILE_TICKET_TTL_SECONDS, RELAY_PASS_TTL_SECONDS,
  type JsonWebKeySet,
} from '@agenthix/core'

const keys = vi.hoisted(() => ({ kid: '', key: null as unknown, jwks: { keys: [] } as { keys: unknown[] } }))

vi.mock('../../server/identity/signingKeyService', () => ({
  SIGNING_ALG: 'RS256',
  getSigningKey: async () => ({ kid: keys.kid, key: keys.key }),
}))

import { signFileTicket, signRelayPass, type FileTicketInput } from '../relayTokens'

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  keys.kid = await calculateJwkThumbprint(jwk)
  keys.key = pair.privateKey as CryptoKey
  keys.jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: keys.kid, alg: 'RS256', use: 'sig' }] }
})

const jwks = () => keys.jwks as unknown as JsonWebKeySet
const ticketInput: FileTicketInput = {
  space: 'place',
  purpose: 'preview',
  loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  path: 'docs/plan.pdf',
  version: '1024:1700000000000',
  person: 'u1',
  site: 'site-1',
  relay: 'relay-1',
}

const b64url = (s: string) => Buffer.from(s).toString('base64url')
const fromB64url = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
/** The token with one payload claim changed and the signature kept: what an attacker who holds a ticket can make. */
function altered(token: string, change: (payload: Record<string, unknown>) => void): string {
  const [h, p, s] = token.split('.')
  const payload = fromB64url(p)
  change(payload)
  return `${h}.${b64url(JSON.stringify(payload))}.${s}`
}

describe('file tickets @SC-1522', () => {
  it('signs a ticket core accepts, with every claim and a five-minute life', async () => {
    const { token, expiresAt } = await signFileTicket(ticketInput)
    const verdict = await verifyRelayToken(token, { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), audience: 'site-1', nowMs: Date.now(), relay: 'relay-1' })
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.claims).toMatchObject({ ...ticketInput, aud: 'site-1', tokenType: FILE_TICKET_TOKEN_TYPE, iss: 'agenthix-hq' })
    expect(verdict.claims.exp - verdict.claims.iat).toBe(FILE_TICKET_TTL_SECONDS)
    expect(expiresAt).toBe(verdict.claims.exp * 1000)
  })

  it.each([
    ['purpose', (p: Record<string, unknown>) => { p.purpose = 'download' }],
    ['loc', (p: Record<string, unknown>) => { p.loc = { ownerType: 'project', ownerId: 'p2' } }],
    ['path', (p: Record<string, unknown>) => { p.path = '../../etc/passwd' }],
    ['version', (p: Record<string, unknown>) => { p.version = '1:1' }],
    ['person', (p: Record<string, unknown>) => { p.person = 'u2' }],
    ['site', (p: Record<string, unknown>) => { p.site = 'site-2'; p.aud = 'site-2' }],
    ['relay', (p: Record<string, unknown>) => { p.relay = 'relay-2' }],
    ['expiry', (p: Record<string, unknown>) => { p.exp = (p.exp as number) + 3600 }],
    ['type', (p: Record<string, unknown>) => { p.tokenType = RELAY_PASS_TOKEN_TYPE }],
  ])('refuses a ticket whose %s was altered', async (_field, change) => {
    const { token } = await signFileTicket(ticketInput)
    const verdict = await verifyRelayToken(altered(token, change), { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), audience: 'site-1', nowMs: Date.now() })
    expect(verdict).toMatchObject({ ok: false, refusal: 'forged' })
  })

  it('is refused by another site, on another relay\'s line, and once expired', async () => {
    const { token } = await signFileTicket(ticketInput)
    const base = { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), nowMs: Date.now() } as const
    expect(await verifyRelayToken(token, { ...base, audience: 'site-2' })).toMatchObject({ refusal: 'wrong-audience' })
    expect(await verifyRelayToken(token, { ...base, audience: 'site-1', relay: 'relay-2' })).toMatchObject({ refusal: 'wrong-relay' })
    expect(await verifyRelayToken(token, { ...base, audience: 'site-1', nowMs: Date.now() + (FILE_TICKET_TTL_SECONDS + 1) * 1000 }))
      .toMatchObject({ refusal: 'expired' })
  })

  it('refuses to sign a purpose not accepted, or a ticket missing what it must name', async () => {
    await expect(signFileTicket({ ...ticketInput, purpose: 'diff' as never })).rejects.toThrow(/purpose/)
    await expect(signFileTicket({ ...ticketInput, relay: '' })).rejects.toThrow(/relay/)
    await expect(signFileTicket({ ...ticketInput, person: '' })).rejects.toThrow(/person/)
    await expect(signFileTicket({ ...ticketInput, path: '../x' })).rejects.toThrow(/file/)
  })

  it('signs only the fields of the file\'s own space', async () => {
    const stray = { ...ticketInput, space: 'artefact', owner: { ownerType: 'project', ownerId: 'p1' }, name: 'report.pdf' } as unknown as FileTicketInput
    const { token } = await signFileTicket(stray)
    const payload = fromB64url(token.split('.')[1])
    expect(payload).toMatchObject({ space: 'artefact', name: 'report.pdf', site: 'site-1' })
    expect(payload).not.toHaveProperty('loc')
    expect(payload).not.toHaveProperty('path')
  })

  it('signs a knowledge page\'s ticket the site accepts', async () => {
    const { token } = await signFileTicket({
      space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'processes/release.md', versionId: 'v3',
      purpose: 'download', version: '10:1', person: 'u1', site: 'site-1', relay: 'relay-1',
    })
    const verdict = await verifyRelayToken(token, { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), audience: 'site-1', nowMs: Date.now(), relay: 'relay-1' })
    expect(verdict).toMatchObject({ ok: true, claims: { space: 'knowledge', path: 'processes/release.md', versionId: 'v3' } })
  })

  it('signs an upload\'s ticket for hq\'s relay, its audience the relay, and a site refuses it', async () => {
    const upload: FileTicketInput = { space: 'upload', path: '/files/task/t1/a1/plan.pdf', purpose: 'preview', version: '1:1', person: 'u1', relay: 'relay-1' }
    const { token } = await signFileTicket(upload)
    const base = { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), nowMs: Date.now() } as const
    expect(await verifyRelayToken(token, { ...base, audience: 'relay-1', spaces: ['upload'] })).toMatchObject({ ok: true, claims: upload })
    expect(await verifyRelayToken(token, { ...base, audience: 'relay-1' })).toMatchObject({ refusal: 'wrong-space' })
  })

  it('signs a ticket with no person only for a picture shown before sign-in', async () => {
    const picture = { space: 'upload', purpose: 'preview', version: '1:1', person: null, relay: 'relay-1' } as const
    const { token } = await signFileTicket({ ...picture, path: '/org/images/logo.png' })
    const verdict = await verifyRelayToken(token, { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), audience: 'relay-1', nowMs: Date.now(), spaces: ['upload'] })
    expect(verdict).toMatchObject({ ok: true, claims: { person: null, path: '/org/images/logo.png' } })
    await expect(signFileTicket({ ...picture, path: '/files/task/t1/a1/plan.pdf' })).rejects.toThrow(/person/)
    await expect(signFileTicket({ ...ticketInput, person: null as unknown as string })).rejects.toThrow(/person/)
  })
})

describe('relay passes @SC-1522', () => {
  it('signs a pass core accepts for this site on this relay, with an hour\'s life', async () => {
    const { token, expiresAt } = await signRelayPass({ siteId: 'site-1', relayId: 'relay-1' })
    const verdict = await verifyRelayToken(token, { type: RELAY_PASS_TOKEN_TYPE, keys: jwks(), audience: 'relay-1', nowMs: Date.now(), site: 'site-1' })
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.claims).toMatchObject({ sub: 'site-1', aud: 'relay-1', tokenType: RELAY_PASS_TOKEN_TYPE })
    expect(verdict.claims.exp - verdict.claims.iat).toBe(RELAY_PASS_TTL_SECONDS)
    expect(expiresAt).toBe(verdict.claims.exp * 1000)
  })

  it.each([
    ['site', (p: Record<string, unknown>) => { p.sub = 'site-2' }],
    ['relay', (p: Record<string, unknown>) => { p.aud = 'relay-2' }],
    ['expiry', (p: Record<string, unknown>) => { p.exp = (p.exp as number) + 60 }],
    ['type', (p: Record<string, unknown>) => { p.tokenType = FILE_TICKET_TOKEN_TYPE }],
  ])('refuses a pass whose %s was altered', async (_field, change) => {
    const { token } = await signRelayPass({ siteId: 'site-1', relayId: 'relay-1' })
    const verdict = await verifyRelayToken(altered(token, change), { type: RELAY_PASS_TOKEN_TYPE, keys: jwks(), audience: 'relay-1', nowMs: Date.now() })
    expect(verdict).toMatchObject({ ok: false, refusal: 'forged' })
  })

  it('is refused by another relay, and when presented by another site', async () => {
    const { token } = await signRelayPass({ siteId: 'site-1', relayId: 'relay-1' })
    const base = { type: RELAY_PASS_TOKEN_TYPE, keys: jwks(), nowMs: Date.now() } as const
    expect(await verifyRelayToken(token, { ...base, audience: 'relay-2' })).toMatchObject({ refusal: 'wrong-audience' })
    expect(await verifyRelayToken(token, { ...base, audience: 'relay-1', site: 'site-2' })).toMatchObject({ refusal: 'wrong-site' })
  })

  it('cannot be passed off as a ticket, nor a ticket as a pass', async () => {
    const pass = await signRelayPass({ siteId: 'site-1', relayId: 'site-1' })
    const ticket = await signFileTicket(ticketInput)
    expect(await verifyRelayToken(pass.token, { type: FILE_TICKET_TOKEN_TYPE, keys: jwks(), audience: 'site-1', nowMs: Date.now() }))
      .toMatchObject({ refusal: 'wrong-type' })
    expect(await verifyRelayToken(ticket.token, { type: RELAY_PASS_TOKEN_TYPE, keys: jwks(), audience: 'site-1', nowMs: Date.now() }))
      .toMatchObject({ refusal: 'wrong-type' })
  })
})
