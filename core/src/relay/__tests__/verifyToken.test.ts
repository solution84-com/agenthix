import { beforeAll, describe, expect, it } from 'vitest'
import { HQ_TOKEN_ISSUER } from '../../protocol/capability.js'
import { readTicketRoute, verifyRelayToken } from '../verifyToken.js'
import { FILE_TICKET_TTL_SECONDS, RELAY_PASS_TTL_SECONDS } from '../tokens.js'
import { makeSigner, signHs256, unsigned, withPayload, type TestSigner } from './tokenSigner.js'

const NOW = 1_800_000_000
const nowMs = NOW * 1000

const ticket = (over: Record<string, unknown> = {}) => ({
  iss: HQ_TOKEN_ISSUER, aud: 'site-1', sub: 'person-1', iat: NOW, exp: NOW + FILE_TICKET_TTL_SECONDS,
  tokenType: 'file-ticket', purpose: 'preview', space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  path: 'reports/q3.pdf', version: '2048:1799999000000', person: 'person-1', site: 'site-1', relay: 'relay-1',
  ...over,
})
const UPLOAD_PATH = '/files/task/t1/a1/notes.txt'
const upload = (over: Record<string, unknown> = {}) => {
  const { loc: _loc, path: _path, site: _site, ...rest } = ticket({ aud: 'relay-1' })
  return { ...rest, space: 'upload', path: UPLOAD_PATH, ...over }
}
const pass = (over: Record<string, unknown> = {}) => ({
  iss: HQ_TOKEN_ISSUER, aud: 'relay-1', sub: 'site-1', iat: NOW, exp: NOW + RELAY_PASS_TTL_SECONDS,
  tokenType: 'relay-pass', ...over,
})

let hq: TestSigner
let other: TestSigner
const asTicket = (token: string, over: object = {}) =>
  verifyRelayToken(token, { type: 'file-ticket', keys: hq.keys, audience: 'site-1', relay: 'relay-1', nowMs, ...over })
const asPass = (token: string, over: object = {}) =>
  verifyRelayToken(token, { type: 'relay-pass', keys: hq.keys, audience: 'relay-1', site: 'site-1', nowMs, ...over })
const refusal = async (p: Promise<{ ok: boolean; refusal?: string }>) => (await p).refusal

beforeAll(async () => {
  hq = await makeSigner('hq-key-1')
  other = await makeSigner('hq-key-1')
})

describe('a file ticket is verified whole', () => {
  it('accepts a ticket hq signed and returns its claims @SC-1454', async () => {
    const verdict = await asTicket(await hq.sign(ticket()))
    expect(verdict).toMatchObject({ ok: true, claims: { purpose: 'preview', path: 'reports/q3.pdf', relay: 'relay-1' } })
  })

  it('refuses a ticket signed by any other key, even under hq\'s key id @SC-1454 @SC-1562', async () => {
    expect(await refusal(asTicket(await other.sign(ticket())))).toBe('forged')
  })

  it('refuses a tampered payload @SC-1454 @SC-1562', async () => {
    const token = await hq.sign(ticket())
    expect(await refusal(asTicket(withPayload(token, ticket({ path: '../../etc/passwd' }))))).toBe('forged')
    expect(await refusal(asTicket(withPayload(token, ticket({ exp: NOW + 10 * 365 * 86400 }))))).toBe('forged')
  })

  it('refuses alg none @SC-1454', async () => {
    expect(await refusal(asTicket(unsigned(ticket(), hq.kid)))).toBe('forged')
  })

  it('refuses an HS256 token signed with hq\'s public key as the secret @SC-1454', async () => {
    const asSecret = JSON.stringify(hq.jwk)
    expect(await refusal(asTicket(await signHs256(ticket(), asSecret, hq.kid)))).toBe('forged')
    expect(await refusal(asTicket(await signHs256(ticket(), hq.jwk.n!, hq.kid)))).toBe('forged')
  })

  it('refuses a key id the key set does not hold, so the caller can refetch it @SC-1454', async () => {
    expect(await refusal(asTicket(await hq.sign(ticket(), { alg: 'RS256', kid: 'rotated' })))).toBe('unknown-key')
    expect(await refusal(asTicket(await hq.sign(ticket(), { alg: 'RS256' })))).toBe('malformed')
  })

  it('refuses a key that is not an RS256 signing key @SC-1454', async () => {
    const keys = { keys: [{ ...hq.jwk, use: 'enc' }] }
    expect(await refusal(asTicket(await hq.sign(ticket()), { keys }))).toBe('forged')
  })

  it('refuses critical header extensions @SC-1454', async () => {
    expect(await refusal(asTicket(await hq.sign(ticket(), { alg: 'RS256', kid: hq.kid, crit: ['b64'] })))).toBe('forged')
  })

  it('expires at its expiry second, not one second after @SC-1455 @SC-1563 @SC-1570', async () => {
    const token = await hq.sign(ticket())
    const exp = NOW + FILE_TICKET_TTL_SECONDS
    expect((await asTicket(token, { nowMs: exp * 1000 - 1 })).ok).toBe(true)
    expect(await refusal(asTicket(token, { nowMs: exp * 1000 }))).toBe('expired')
  })

  it('refuses a ticket claiming a longer life than five minutes @SC-1455', async () => {
    const token = await hq.sign(ticket({ exp: NOW + FILE_TICKET_TTL_SECONDS + 1 }))
    expect(await refusal(asTicket(token))).toBe('expired')
  })

  it('refuses the wrong issuer, type, audience, relay and purpose @SC-1455', async () => {
    expect(await refusal(asTicket(await hq.sign(ticket({ iss: 'someone' }))))).toBe('wrong-issuer')
    expect(await refusal(asTicket(await hq.sign(ticket({ tokenType: 'capability' }))))).toBe('wrong-type')
    expect(await refusal(asTicket(await hq.sign(ticket()), { audience: 'site-2' }))).toBe('wrong-audience')
    expect(await refusal(asTicket(await hq.sign(ticket({ aud: ['site-1'] }))))).toBe('wrong-audience')
    expect(await refusal(asTicket(await hq.sign(ticket()), { relay: 'relay-2' }))).toBe('wrong-relay')
    expect(await refusal(asTicket(await hq.sign(ticket({ purpose: 'ide-session' }))))).toBe('wrong-purpose')
    expect(await refusal(asTicket(await hq.sign(ticket({ purpose: 'anything' }))))).toBe('wrong-purpose')
    expect(await refusal(asTicket(await hq.sign(ticket({ purpose: 'preview' })), { purposes: ['download'] }))).toBe('wrong-purpose')
  })

  it('refuses a pass presented as a ticket, and a ticket presented as a pass @SC-1455', async () => {
    expect(await refusal(asTicket(await hq.sign(pass({ aud: 'site-1' }))))).toBe('wrong-type')
    expect(await refusal(asPass(await hq.sign(ticket({ aud: 'relay-1', site: 'relay-1', exp: NOW + 60 })))))
      .toBe('wrong-type')
  })

  it('refuses a ticket missing a field or of the wrong shape @SC-1455', async () => {
    for (const over of [
      { loc: undefined }, { loc: { ownerType: 'org', ownerId: 'o' } }, { loc: { ownerType: 'project', ownerId: '' } },
      { loc: { ownerType: 'project', ownerId: 'p', workspaceId: 'w', taskId: 't' } },
      { path: '' }, { path: 'a\0b' }, { version: undefined }, { person: 7 }, { relay: undefined },
      { site: 'site-2' }, { iat: 'yesterday' }, { exp: undefined }, { path: '../../etc/passwd' },
    ]) {
      expect(await refusal(asTicket(await hq.sign(ticket(over)))), JSON.stringify(over)).toBe('malformed')
    }
  })

  it('refuses what is not a compact JWT @SC-1455', async () => {
    for (const token of ['', 'a.b', 'a.b.c.d', '!!.!!.!!', `${'a'.repeat(9000)}.b.c`]) {
      expect(await refusal(asTicket(token)), token.slice(0, 20)).toBe('malformed')
    }
  })

  it('never puts the token in a refusal @SC-1455', async () => {
    const token = await other.sign(ticket())
    const verdict = await asTicket(token)
    expect(JSON.stringify(verdict)).not.toContain(token.split('.')[2])
  })
})

describe('a relay pass is verified whole @SC-1456 @SC-1565', () => {
  it('accepts a pass hq gave this site for this relay', async () => {
    expect(await asPass(await hq.sign(pass()))).toMatchObject({ ok: true, claims: { sub: 'site-1', aud: 'relay-1' } })
  })

  it('refuses a pass for another relay, or presented by another site', async () => {
    expect(await refusal(asPass(await hq.sign(pass()), { audience: 'relay-2' }))).toBe('wrong-audience')
    expect(await refusal(asPass(await hq.sign(pass()), { site: 'site-2' }))).toBe('wrong-site')
    expect(await refusal(asPass(await hq.sign(pass({ sub: undefined }))))).toBe('malformed')
  })

  it('expires, and may live an hour at most', async () => {
    const token = await hq.sign(pass())
    expect(await refusal(asPass(token, { nowMs: (NOW + RELAY_PASS_TTL_SECONDS) * 1000 }))).toBe('expired')
    expect(await refusal(asPass(await hq.sign(pass({ exp: NOW + RELAY_PASS_TTL_SECONDS + 1 }))))).toBe('expired')
  })

  it('refuses a pass signed by another key', async () => {
    expect(await refusal(asPass(await other.sign(pass())))).toBe('forged')
  })
})

describe('the relay reads where a ticket goes, without verifying it @SC-1457', () => {
  it('reads its site and person', async () => {
    expect(readTicketRoute(await other.sign(ticket()))).toEqual({ servedBy: 'site', site: 'site-1', person: 'person-1' })
  })

  it('reads nothing from what is not a ticket\'s shape', async () => {
    expect(readTicketRoute('nonsense')).toBeNull()
    expect(readTicketRoute(await hq.sign(pass()))).toBeNull()
  })

  it('reads that an upload is served by the relay itself', async () => {
    expect(readTicketRoute(await other.sign(upload()))).toEqual({ servedBy: 'relay', person: 'person-1' })
    expect(readTicketRoute(await other.sign(upload({ path: '/org/images/logo.svg', person: null })))).toEqual({ servedBy: 'relay', person: null })
    expect(readTicketRoute(await other.sign(ticket({ person: null })))).toBeNull()
    expect(readTicketRoute(await other.sign(ticket({ space: undefined })))).toBeNull()
  })
})

describe('a ticket names its file in one of four spaces @SC-1458', () => {
  const asUpload = (token: string, over: object = {}) =>
    verifyRelayToken(token, { type: 'file-ticket', keys: hq.keys, audience: 'relay-1', spaces: ['upload'], nowMs, ...over })
  const artefact = () => {
    const { loc: _loc, path: _path, ...rest } = ticket()
    return { ...rest, space: 'artefact', owner: { ownerType: 'project', ownerId: 'p1' }, name: 'summary.md' }
  }
  const knowledge = (over: Record<string, unknown> = {}) => {
    const { loc: _loc, ...rest } = ticket()
    return { ...rest, space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'processes/release.md', ...over }
  }

  it('accepts an artefact and a knowledge page, served by the site', async () => {
    expect(await asTicket(await hq.sign(artefact()))).toMatchObject({ ok: true, claims: { space: 'artefact', name: 'summary.md' } })
    expect(await asTicket(await hq.sign(knowledge({ versionId: 'v3' }))))
      .toMatchObject({ ok: true, claims: { space: 'knowledge', path: 'processes/release.md', versionId: 'v3' } })
  })

  it('refuses a ticket that names no space, or one it does not know', async () => {
    expect(await refusal(asTicket(await hq.sign(ticket({ space: undefined }))))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign(ticket({ space: 'disk' }))))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign(artefact()), { spaces: ['place'] }))).toBe('wrong-space')
  })

  it('accepts an upload at hq\'s relay, whose audience is the relay', async () => {
    expect(await asUpload(await hq.sign(upload()))).toMatchObject({ ok: true, claims: { space: 'upload', path: UPLOAD_PATH } })
  })

  it('never lets a site serve an upload, nor the relay a site\'s file', async () => {
    // A site leaves `spaces` out: it serves only its own three.
    expect(await refusal(asTicket(await hq.sign(upload({ aud: 'site-1', relay: 'site-1' }))))).toBe('wrong-space')
    expect(await refusal(asUpload(await hq.sign(ticket({ aud: 'relay-1', site: 'relay-1' }))))).toBe('wrong-space')
  })

  it('refuses an upload outside the upload paths, or naming a site', async () => {
    for (const over of [
      { path: '/etc/passwd' }, { path: '/files/task/t1/a1/../../../../etc/passwd' }, { path: 'files/task/t1/a1/x' },
      { site: 'site-1' }, { relay: 'relay-2' }, { loc: { ownerType: 'project', ownerId: 'p1' } },
    ]) {
      expect(await refusal(asUpload(await hq.sign(upload(over)))), JSON.stringify(over)).toBe('malformed')
    }
  })

  it('lets a picture the sign-in page shows be opened by nobody in particular, and nothing else', async () => {
    expect(await asUpload(await hq.sign(upload({ path: '/org/images/logo.svg', person: null }))))
      .toMatchObject({ ok: true, claims: { space: 'upload', path: '/org/images/logo.svg', person: null } })
    for (const path of [UPLOAD_PATH, '/people/u1/images/me.webp', '/teams/t1/images/crest.png']) {
      expect(await refusal(asUpload(await hq.sign(upload({ path, person: null })))), path).toBe('malformed')
    }
    expect(await refusal(asUpload(await hq.sign(upload({ path: '/org/images/logo.svg', person: undefined }))))).toBe('malformed')
    expect(await refusal(asUpload(await hq.sign(upload({ path: '/org/images/logo.svg', person: '' }))))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign(ticket({ person: null }))))).toBe('malformed')
  })

  it('refuses an artefact or page of the wrong shape', async () => {
    expect(await refusal(asTicket(await hq.sign({ ...artefact(), name: '../x' })))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign({ ...artefact(), owner: { ownerType: 'org', ownerId: 'org' } })))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign(knowledge({ path: '../../secret' }))))).toBe('malformed')
    expect(await refusal(asTicket(await hq.sign(knowledge({ versionId: '' }))))).toBe('malformed')
  })
})
