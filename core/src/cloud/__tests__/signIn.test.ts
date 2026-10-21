import { describe, expect, it } from 'vitest'
import { checkCloudIdToken, newCloudFlowValue, pkceChallengeOf } from '../crypto/index.js'
import { parseCloudBaseUrl } from '../connection.js'
import {
  cloudAuthorizeUrl, cloudIssuer, isCloudFlowValue, parseCloudAuthorizationCodeRequest, parseCloudAuthorizeRequest,
  parseCloudDowntimeNotice, parseCloudIdTokenAnswer,
} from '../signIn.js'
import { toBase64url, utf8 } from '../../host/crypto/webCrypto.js'
import { SCHEDULED_CHANGE_KINDS } from '../../host/scheduledChange.js'

const BASE = parseCloudBaseUrl('https://cloud.example.com')!
const T0 = Date.UTC(2026, 0, 1)
const NOW_S = T0 / 1000
const CLIENT = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'
const NONCE = 'n'.repeat(43)

const part = (v: object) => toBase64url(utf8(JSON.stringify(v)))
function idToken(over: Record<string, unknown> = {}, header: object = { alg: 'EdDSA', typ: 'JWT' }): string {
  const claims = { iss: 'https://cloud.example.com', sub: 'acct_123', aud: CLIENT, nonce: NONCE, iat: NOW_S, exp: NOW_S + 300, ...over }
  return `${part(header)}.${part(claims)}.c2ln`
}
const expected = { issuer: cloudIssuer(BASE), clientId: CLIENT, nonce: NONCE }

describe('the authorize request @SC-1084', () => {
  it('asks only for openid, with PKCE S256, state and nonce, and Cloud reads it back', () => {
    const [page, search] = cloudAuthorizeUrl(BASE, {
      client_id: CLIENT, redirect_uri: 'https://hq.example/login/cloud', state: 's'.repeat(43), nonce: NONCE, code_challenge: 'c'.repeat(43),
    }).split('?')
    expect(page).toBe('https://cloud.example.com/connect/authorize')
    const query = Object.fromEntries(search.split('&').map(pair => pair.split('=').map(decodeURIComponent)))
    expect(query.redirect_uri).toBe('https://hq.example/login/cloud')
    expect(query).toMatchObject({ response_type: 'code', scope: 'openid', code_challenge_method: 'S256' })
    expect(parseCloudAuthorizeRequest(query)).toMatchObject({ client_id: CLIENT, state: 's'.repeat(43), nonce: NONCE })
  })

  it('Cloud refuses one asking for more than openid, or without PKCE S256', () => {
    const good = { response_type: 'code', client_id: CLIENT, redirect_uri: 'https://hq.example/login/cloud', scope: 'openid', state: 's'.repeat(43), nonce: NONCE, code_challenge: 'c'.repeat(43), code_challenge_method: 'S256' }
    expect(parseCloudAuthorizeRequest(good)).not.toBeNull()
    expect(parseCloudAuthorizeRequest({ ...good, scope: 'openid organisations' })).toBeNull()
    expect(parseCloudAuthorizeRequest({ ...good, code_challenge_method: 'plain' })).toBeNull()
    expect(parseCloudAuthorizeRequest({ ...good, state: 'short' })).toBeNull()
  })

  it('the code exchange needs a verifier, and the answer an ID token', () => {
    expect(parseCloudAuthorizationCodeRequest({ grant_type: 'authorization_code', code: 'c'.repeat(20), redirect_uri: 'https://hq/x', code_verifier: 'v'.repeat(43) })).not.toBeNull()
    expect(parseCloudAuthorizationCodeRequest({ grant_type: 'authorization_code', code: 'c'.repeat(20), redirect_uri: 'https://hq/x' })).toBeNull()
    expect(parseCloudIdTokenAnswer({ access_token: 'x', id_token: 'a.b.c' })).toEqual({ id_token: 'a.b.c' })
    expect(parseCloudIdTokenAnswer({ access_token: 'x' })).toBeNull()
  })
})

describe('PKCE and the flow values @SC-1084', () => {
  it('matches RFC 7636 appendix B', async () => {
    expect(await pkceChallengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('a new value is 43 unreserved characters, and never the same twice', () => {
    const a = newCloudFlowValue()
    expect(isCloudFlowValue(a)).toBe(true)
    expect(newCloudFlowValue()).not.toBe(a)
  })
})

describe("hq's checks on the ID token @SC-1084", () => {
  it('passes one from Cloud, for this hq, with this nonce, and gives the subject', () => {
    expect(checkCloudIdToken(idToken(), expected, T0)).toEqual({ ok: true, subject: 'acct_123' })
  })

  it.each([
    ['another issuer', { iss: 'https://evil.example' }, 'wrong_issuer'],
    ['another audience', { aud: 'someone-else' }, 'wrong_audience'],
    ['an audience shared with another client', { aud: [CLIENT, 'other'] }, 'wrong_audience'],
    ['another authorised party', { azp: 'other' }, 'wrong_audience'],
    ['another nonce', { nonce: 'm'.repeat(43) }, 'wrong_nonce'],
    ['no nonce', { nonce: undefined }, 'malformed'],
    ['expired', { iat: NOW_S - 1000, exp: NOW_S - 100 }, 'expired'],
    ['issued too long ago', { iat: NOW_S - 3600, exp: NOW_S + 3600 }, 'expired'],
    ['issued in the future', { iat: NOW_S + 600, exp: NOW_S + 900 }, 'not_yet_valid'],
    ['no subject', { sub: '' }, 'malformed'],
  ])('refuses one with %s', (_name, over, reason) => {
    expect(checkCloudIdToken(idToken(over), expected, T0)).toEqual({ ok: false, reason })
  })

  it('refuses an unsigned token and one that is not three parts', () => {
    expect(checkCloudIdToken(idToken({}, { alg: 'none' }), expected, T0)).toEqual({ ok: false, reason: 'malformed' })
    expect(checkCloudIdToken('a.b', expected, T0)).toEqual({ ok: false, reason: 'malformed' })
  })
})

describe('the downtime notice @SC-1085', () => {
  const notice = { notice_id: 'c0ffee-1', kind: 'upgrade', at: '2026-02-01T10:00:00.000Z', expected_minutes: 20, affects: 'hq', recipients: ['acct_1'], withdrawn: false }

  it('Cloud reads one hq sends', () => {
    expect(parseCloudDowntimeNotice(notice)).toEqual(notice)
  })

  it('names its kind from the closed list of scheduled changes, so Cloud has an email for each', () => {
    for (const kind of SCHEDULED_CHANGE_KINDS) expect(parseCloudDowntimeNotice({ ...notice, kind })?.kind).toBe(kind)
  })

  it.each([
    ['a bad id', { notice_id: 'has space' }],
    ['no time', { at: 'soon' }],
    ['an unknown reach', { affects: 'everyone' }],
    ['a kind that is not a scheduled change', { kind: 'reboot' }],
    ['a recipient that is not a subject', { recipients: ['a b'] }],
    ['no withdrawn flag', { withdrawn: undefined }],
  ])('Cloud refuses one with %s', (_name, over) => {
    expect(parseCloudDowntimeNotice({ ...notice, ...over })).toBeNull()
  })
})
