/**
 * Signing in to hq with an Agenthix account, against the stand-in Cloud: the authorization code flow with PKCE, the
 * `state`, `nonce` and PKCE checks, linking from Settings, and the refusals — never an account made.
 */
import { describe, expect, it } from 'vitest'
import { CloudSignIn, CloudSignInRefusal, type CloudLinkStore } from '../cloudSignIn'
import { SignInFlows } from '../signInFlows'
import { connectedCloud } from './connectedCloud'

type Link = { userId: string; issuer: string; subject: string }

async function harness(options: { connect?: boolean } = {}) {
  const h = await connectedCloud(options)
  const links: Link[] = []
  const removed = new Set<string>()
  const sessions: string[] = []
  const store: CloudLinkStore = {
    personWith: async (issuer, subject) => {
      const l = links.find(x => x.issuer === issuer && x.subject === subject)
      return l ? { userId: l.userId, active: !removed.has(l.userId) } : null
    },
    link: async (userId, issuer, subject) => {
      if (links.some(x => x.issuer === issuer && x.subject === subject && x.userId !== userId)) return 'taken'
      links.splice(0, links.length, ...links.filter(x => x.userId !== userId), { userId, issuer, subject })
      return 'linked'
    },
  }
  const signIn = new CloudSignIn({
    connection: () => h.connection,
    base: h.cloud.base,
    hqAddress: () => 'https://hq.acme.example',
    links: store,
    flows: new SignInFlows(h.now),
    passwordIsRight: async (_userId, password) => password === 'right-password',
    makeSession: async userId => { sessions.push(userId); return `session-of-${userId}` },
    now: h.now,
  })
  /** The person's browser: hq starts, Cloud signs them in as `subject`, and the query comes back to hq. */
  async function goToCloud(subject: string, start = () => signIn.startSignIn()) {
    const { authorizeUrl, binding } = await start()
    const back = new URL(await h.cloud.accounts.authorize(authorizeUrl, subject))
    return { back, binding, query: Object.fromEntries(back.searchParams), authorizeUrl }
  }
  return { ...h, signIn, links, removed, sessions, goToCloud }
}

async function refusal(work: Promise<unknown>): Promise<CloudSignInRefusal> {
  const err = await work.then(() => null, e => e)
  expect(err).toBeInstanceOf(CloudSignInRefusal)
  return err as CloudSignInRefusal
}

describe('signing in with an Agenthix account @SC-1091', () => {
  it('is off while hq is not connected, and Cloud is never asked', async () => {
    const h = await harness({ connect: false })
    expect(await h.signIn.connected()).toBe(false)
    expect((await refusal(h.signIn.startSignIn())).code).toBe('not_connected')
    expect(h.cloud.requests).toEqual([])
  })

  it("sends the browser to Cloud asking only for openid, with PKCE S256, state, nonce and hq's own return address", async () => {
    const h = await harness()
    expect(await h.signIn.connected()).toBe(true)
    const { authorizeUrl } = await h.signIn.startSignIn()
    const url = new URL(authorizeUrl)
    expect(url.origin).toBe('https://cloud.test')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code', scope: 'openid', code_challenge_method: 'S256', client_id: h.clientId(),
      redirect_uri: 'https://hq.acme.example/login/cloud',
    })
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('Cloud sends a sign-in back only to the address hq registered, never to one the request names @SC-1144', async () => {
    const h = await harness()
    const { authorizeUrl } = await h.signIn.startSignIn()
    for (const elsewhere of ['https://evil.example/login/cloud', 'https://hq.acme.example.evil.example/login/cloud', 'https://hq.acme.example/other']) {
      const url = new URL(authorizeUrl)
      url.searchParams.set('redirect_uri', elsewhere)
      await expect(h.cloud.accounts.authorize(url.toString(), 'acct_dana')).rejects.toThrow(/error page/)
    }
    expect(h.cloud.accounts.codes).toEqual([])
  })

  it("signs a linked person in with hq's own session, the code exchanged with a signed request and the verifier", async () => {
    const h = await harness()
    h.links.push({ userId: 'u-dana', issuer: 'https://cloud.test', subject: 'acct_dana' })
    const { query, binding } = await h.goToCloud('acct_dana')
    expect(await h.signIn.finish({ ...query, binding }, null)).toEqual({ kind: 'signedIn', sessionId: 'session-of-u-dana' })
    const exchange = h.cloud.requests.at(-1)!
    expect(exchange.form).toMatchObject({ grant_type: 'authorization_code', redirect_uri: 'https://hq.acme.example/login/cloud' })
    expect(exchange.form.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(exchange.form.client_assertion).toBeTruthy()
    expect(JSON.stringify(h.cloud.requests)).not.toContain(h.privateKey())
  })

  it('refuses an account not linked, saying to link it from Settings first, and makes no account @SC-1092', async () => {
    const h = await harness()
    const { query, binding } = await h.goToCloud('acct_stranger')
    const err = await refusal(h.signIn.finish({ ...query, binding }, null))
    expect(err.code).toBe('not_linked')
    expect(err.message).toContain('link it in Settings › Sign-in first')
    expect(h.sessions).toEqual([])
    expect(h.links).toEqual([])
  })

  it('refuses someone who has left the organisation @SC-1092', async () => {
    const h = await harness()
    h.links.push({ userId: 'u-gone', issuer: 'https://cloud.test', subject: 'acct_gone' })
    h.removed.add('u-gone')
    const { query, binding } = await h.goToCloud('acct_gone')
    expect((await refusal(h.signIn.finish({ ...query, binding }, null))).code).toBe('removed')
    expect(h.sessions).toEqual([])
  })

  it('says so when the person said no on Cloud @SC-1092', async () => {
    const h = await harness()
    const { authorizeUrl, binding } = await h.signIn.startSignIn()
    const back = new URL(await h.cloud.accounts.authorize(authorizeUrl, 'acct_dana', 'deny'))
    expect((await refusal(h.signIn.finish({ ...Object.fromEntries(back.searchParams), binding }, null))).code).toBe('cancelled')
  })
})

describe('what a sign-in is bound by @SC-1092', () => {
  async function linked() {
    const h = await harness()
    h.links.push({ userId: 'u-dana', issuer: 'https://cloud.test', subject: 'acct_dana' })
    return h
  }

  it('refuses a state hq never gave', async () => {
    const h = await linked()
    const { query, binding } = await h.goToCloud('acct_dana')
    expect((await refusal(h.signIn.finish({ ...query, state: 'x'.repeat(43), binding }, null))).code).toBe('expired')
  })

  it("refuses a return without this tab's binding, as a code planted in another browser would be", async () => {
    const h = await linked()
    const { query } = await h.goToCloud('acct_dana')
    expect((await refusal(h.signIn.finish({ ...query, binding: 'y'.repeat(43) }, null))).code).toBe('expired')
    expect(h.sessions).toEqual([])
  })

  it('takes a state once', async () => {
    const h = await linked()
    const { query, binding } = await h.goToCloud('acct_dana')
    await h.signIn.finish({ ...query, binding }, null)
    expect((await refusal(h.signIn.finish({ ...query, binding }, null))).code).toBe('expired')
    expect(h.sessions).toEqual(['u-dana'])
  })

  it('refuses a return after ten minutes', async () => {
    const h = await linked()
    const { query, binding } = await h.goToCloud('acct_dana')
    h.advance(601_000)
    expect((await refusal(h.signIn.finish({ ...query, binding }, null))).code).toBe('expired')
  })

  it("refuses another sign-in's code: Cloud checks it against this sign-in's PKCE verifier", async () => {
    const h = await linked()
    const theirs = await h.goToCloud('acct_dana')
    const mine = await h.signIn.startSignIn()
    const myState = new URL(mine.authorizeUrl).searchParams.get('state')!
    const err = await refusal(h.signIn.finish({ state: myState, binding: mine.binding, code: theirs.query.code }, null))
    expect(err.code).toBe('not_confirmed')
    expect(h.sessions).toEqual([])
  })

  it.each([
    ['another nonce', { nonce: 'z'.repeat(43) }],
    ['another audience', { aud: 'someone-else' }],
    ['another issuer', { iss: 'https://elsewhere.test' }],
    ['a lapsed token', { iat: Math.floor(Date.UTC(2025, 11, 31) / 1000), exp: Math.floor(Date.UTC(2025, 11, 31) / 1000) + 300 }],
  ])('refuses an ID token with %s', async (_name, claims) => {
    const h = await linked()
    const { query, binding } = await h.goToCloud('acct_dana')
    h.cloud.accounts.tamperNextIdToken = claims
    expect((await refusal(h.signIn.finish({ ...query, binding }, null))).code).toBe('not_confirmed')
    expect(h.sessions).toEqual([])
  })

  it('forgets the connection when Cloud says it ended it, and refuses the sign-in', async () => {
    const h = await linked()
    const { query, binding } = await h.goToCloud('acct_dana')
    h.cloud.revokeFromCloud(h.clientId()!)
    expect((await refusal(h.signIn.finish({ ...query, binding }, null))).code).toBe('not_connected')
    expect(await h.signIn.connected()).toBe(false)
    expect(h.events).toEqual(['ending, 0 revoked', 'disconnected by null'])
  })
})

describe('linking, in Settings › Sign-in @SC-1094', () => {
  const startLink = (h: Awaited<ReturnType<typeof harness>>, userId: string | null = 'u-dana', password = 'right-password') =>
    () => h.signIn.startLink(userId, password)

  it('asks for the password first, and starts nothing without the right one', async () => {
    const h = await harness()
    expect((await refusal(h.signIn.startLink('u-dana', 'wrong'))).code).toBe('wrong_password')
    expect((await refusal(h.signIn.startLink(null, 'right-password'))).code).toBe('not_signed_in')
    expect(h.cloud.requests.filter(r => r.form.grant_type === 'authorization_code')).toEqual([])
  })

  it("keeps the account's subject with the person, and signing in with it then signs them in", async () => {
    const h = await harness()
    const linking = await h.goToCloud('acct_dana', startLink(h))
    expect(await h.signIn.finish({ ...linking.query, binding: linking.binding }, 'u-dana')).toEqual({ kind: 'linked' })
    expect(h.links).toEqual([{ userId: 'u-dana', issuer: 'https://cloud.test', subject: 'acct_dana' }])
    const signing = await h.goToCloud('acct_dana')
    expect(await h.signIn.finish({ ...signing.query, binding: signing.binding }, null)).toEqual({ kind: 'signedIn', sessionId: 'session-of-u-dana' })
  })

  it('finishes only for the person who started it', async () => {
    const h = await harness()
    const { query, binding } = await h.goToCloud('acct_dana', startLink(h))
    expect((await refusal(h.signIn.finish({ ...query, binding }, 'u-someone-else'))).code).toBe('other_person')
    expect(h.links).toEqual([])
  })

  it('refuses an account already linked to someone else', async () => {
    const h = await harness()
    h.links.push({ userId: 'u-sam', issuer: 'https://cloud.test', subject: 'acct_dana' })
    const { query, binding } = await h.goToCloud('acct_dana', startLink(h))
    expect((await refusal(h.signIn.finish({ ...query, binding }, 'u-dana'))).code).toBe('taken')
  })
})

describe('disconnecting @SC-1095', () => {
  it('tells the people who sign in with Cloud before the key is revoked, and sign-in is off after', async () => {
    const h = await harness()
    await h.connection.disconnect('u-admin')
    expect(h.events).toEqual(['ending, 0 revoked', 'disconnected by u-admin'])
    expect(h.cloud.requests.at(-1)!.path).toBe('/connect/revoke')
    expect(await h.signIn.connected()).toBe(false)
    expect((await refusal(h.signIn.startSignIn())).code).toBe('not_connected')
  })
})
