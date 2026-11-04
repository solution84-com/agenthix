/**
 * The three sign-in actions (spec §6.3), against the real test database and
 * hq's real memory of open logins: acceptance before the login starts, the
 * boundary gate on each, and the encrypted subscription stored on finish. Only
 * the site's channel is replaced; it answers the way a site does.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CLAUDE_LOGIN_METHODS } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUserWithRole, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

import { startClaudeLogin, completeClaudeLogin, cancelClaudeLogin } from '../claudeLoginActions'
import { _resetLoginsForTests, peekLoginOwner } from '../../sites/claudeLoginStore'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import { decryptSecret } from '../../server/crypto/secretCrypto'

// The operations take Wasp's generated context type; these pass the one field they read.
const ctx = (user?: { id: string }) => ({ user }) as any
const SITE = 'site-1'
const expiresAt = 1_900_000_000_000
const oauthJson = JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt } })

let admin: { id: string }
let person: { id: string }
let projectId: string
type Owner = { ownerType: 'org' | 'project' | 'user'; ownerId: string; caller: () => { id: string } }
let owners: Owner[]

beforeEach(async () => {
  _resetLoginsForTests()
  request.mockReset()
  request.mockImplementation(async (_site: string, method: string) => {
    if (method === CLAUDE_LOGIN_METHODS.start) return { loginId: 'L1', url: 'https://claude.ai/oauth?x=1' }
    if (method === CLAUDE_LOGIN_METHODS.finish) return { oauthJson }
    return { cancelled: true }
  })
  await prisma.executionSite.create({ data: { siteId: SITE, label: 'Local site', isDefault: true, credentialHash: 'h'.repeat(64), protocolVersion: '1.0' } })
  admin = await createUserWithRole('ADMIN')
  person = await createUserWithRole('MEMBER')
  projectId = (await createProject()).id
  await prisma.projectMember.create({ data: { projectId, userId: person.id, role: 'ADMIN' } })
  // A subscription is one person's own (models from one place, part 4): only the caller themselves.
  owners = [{ ownerType: 'user', ownerId: person.id, caller: () => person }]
})
afterEach(() => vi.unstubAllEnvs())

const sent = (method: string) => request.mock.calls.filter((c) => c[1] === method)
const start = (who: { id: string } | undefined, owner: { ownerType: Owner['ownerType']; ownerId: string }, termsAccepted = true) =>
  startClaudeLogin({ ...owner, termsAccepted }, ctx(who))
const stored = () => prisma.aiProvider.findMany()

describe('startClaudeLogin @SC-1197', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    await expect(start(undefined, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({ statusCode: 401 })
  })

  it.each([0])('without termsAccepted is 400 and the site is not asked (owner %i)', async (i) => {
    const { caller, ...owner } = owners[i]
    await expect(start(caller(), owner, false)).rejects.toMatchObject({ statusCode: 400 })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([0])('for a caller who may act for the boundary, asks the default site and returns the link (owner %i)', async (i) => {
    const { caller, ...owner } = owners[i]
    await expect(start(caller(), owner)).resolves.toEqual({ loginId: 'L1', url: 'https://claude.ai/oauth?x=1' })
    expect(sent(CLAUDE_LOGIN_METHODS.start)[0][0]).toBe(SITE)
    expect(peekLoginOwner('L1', caller().id)).toEqual(owner)
  })

  it.each([
    ['the org, even by an admin', () => admin, () => ({ ownerType: 'org' as const, ownerId: 'org' })],
    ['a project, even by its admin', () => person, () => ({ ownerType: 'project' as const, ownerId: projectId })],
    ['another person', () => admin, () => ({ ownerType: 'user' as const, ownerId: person.id })],
  ])('is refused (403) for %s, before any site call', async (_what, who, owner) => {
    await expect(start(who(), owner())).rejects.toMatchObject({ statusCode: 403 })
    expect(request).not.toHaveBeenCalled()
  })

  it.each(['http://claude.ai/oauth', 'javascript:alert(1)', 'not a link'])('does not pass on a link that is not https (%s), and abandons the login', async (url) => {
    request.mockImplementation(async (_site: string, method: string) => (method === CLAUDE_LOGIN_METHODS.start ? { loginId: 'L1', url } : { cancelled: true }))
    await expect(start(person, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({ statusCode: 502, message: expect.stringContaining('Nothing was changed.') })
    expect(sent(CLAUDE_LOGIN_METHODS.cancel)).toHaveLength(1)
    expect(peekLoginOwner('L1', person.id)).toBeNull()
  })

  it('is refused with readable text when hq cannot store secrets, before any site call (R-200)', async () => {
    vi.stubEnv('SECRETS_MASTER_KEY', '')
    await expect(start(person, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining('SECRETS_MASTER_KEY'),
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('passes the shared no-site error (503) through', async () => {
    await prisma.executionSite.update({ where: { siteId: SITE }, data: { status: 'REVOKED' } })
    await expect(start(person, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining('No Execution Site is connected'),
    })
  })

  it('reports an unreachable site as 503 naming it', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('not connected', 'offline'))
    await expect(start(person, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining('Local site'),
    })
  })

  it("reports a site refusal as 400 carrying the site's message", async () => {
    request.mockRejectedValue(new ChannelRequestFailed('Too many sign-ins are in progress', 'handler_error'))
    await expect(start(person, { ownerType: 'user', ownerId: person.id })).rejects.toMatchObject({
      statusCode: 400, message: 'Too many sign-ins are in progress',
    })
  })
})

describe('completeClaudeLogin @SC-1197', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects an empty code with 400 before any site call', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    await expect(completeClaudeLogin({ loginId: 'L1', code: '   ' }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    expect(sent(CLAUDE_LOGIN_METHODS.finish)).toEqual([])
  })

  it.each([0])("stores an encrypted subscription with the file's expiry and acceptance recorded (owner %i)", async (i) => {
    const { caller, ...owner } = owners[i]
    await start(caller(), owner)
    await expect(completeClaudeLogin({ loginId: 'L1', code: '  abc  ' }, ctx(caller()))).resolves.toEqual({ ok: true })

    expect(sent(CLAUDE_LOGIN_METHODS.finish)[0][2]).toEqual({ loginId: 'L1', code: 'abc' })
    const [row] = await stored()
    expect(row).toMatchObject({ ownerUserId: owner.ownerId, vendor: 'anthropic', credentialKind: 'subscription', expiresAt: new Date(expiresAt), termsAcceptedAt: expect.any(Date) })
    expect(decryptSecret(row.secret!)).toBe(oauthJson)
  })

  it('signing in again replaces the stored login and records the new acceptance', async () => {
    await prisma.aiProvider.create({
      data: { name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', ownerUserId: person.id, secret: 'old', termsAcceptedAt: new Date('2026-01-01') },
    })
    await start(person, { ownerType: 'user', ownerId: person.id })
    await completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))
    const rows = await stored()
    expect(rows).toHaveLength(1)
    expect(decryptSecret(rows[0].secret!)).toBe(oauthJson)
    expect(rows[0].termsAcceptedAt!.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime())
  })

  it('two sign-ins finished at the same moment both succeed, and leave one subscription', async () => {
    let n = 0
    request.mockImplementation(async (_site: string, method: string) => {
      if (method === CLAUDE_LOGIN_METHODS.start) return { loginId: `L${++n}`, url: 'https://claude.ai/oauth?x=1' }
      if (method === CLAUDE_LOGIN_METHODS.finish) return { oauthJson }
      return { cancelled: true }
    })
    await start(person, { ownerType: 'user', ownerId: person.id })
    await start(person, { ownerType: 'user', ownerId: person.id })
    const done = await Promise.all([
      completeClaudeLogin({ loginId: 'L1', code: 'a' }, ctx(person)),
      completeClaudeLogin({ loginId: 'L2', code: 'b' }, ctx(person)),
    ])
    expect(done).toEqual([{ ok: true }, { ok: true }])
    expect(await stored()).toHaveLength(1)
  })

  it('checks the secrets key before the code is spent, and spends nothing when it is unusable (R-200)', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    vi.stubEnv('SECRETS_MASTER_KEY', '')
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining('SECRETS_MASTER_KEY'),
    })
    expect(sent(CLAUDE_LOGIN_METHODS.finish)).toEqual([])
    expect(await stored()).toEqual([])
  })

  it("an unknown login, or someone else's, is 404 and stores nothing", async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    await expect(completeClaudeLogin({ loginId: 'nope', code: 'c' }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
    expect(sent(CLAUDE_LOGIN_METHODS.finish)).toEqual([])
    expect(await stored()).toEqual([])
  })

  it('a login already finished is 404 the second time', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    await completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('an implausible document from the site is refused (502) and nothing is stored', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    request.mockResolvedValue({ oauthJson: '{}' })
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))).rejects.toMatchObject({ statusCode: 502 })
    expect(await stored()).toEqual([])
  })

  it('passes the site\'s "did not accept that code" message to the caller and stores nothing', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    request.mockRejectedValue(new ChannelRequestFailed('Claude did not accept that code', 'handler_error'))
    await expect(completeClaudeLogin({ loginId: 'L1', code: 'c' }, ctx(person))).rejects.toMatchObject({
      statusCode: 400, message: 'Claude did not accept that code',
    })
    expect(await stored()).toEqual([])
  })
})

describe('cancelClaudeLogin @SC-1197', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    await expect(cancelClaudeLogin({ loginId: 'L1' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })

  it('asks the site to cancel and forgets the login', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    await expect(cancelClaudeLogin({ loginId: 'L1' }, ctx(person))).resolves.toEqual({ ok: true })
    expect(sent(CLAUDE_LOGIN_METHODS.cancel)[0].slice(0, 3)).toEqual([SITE, CLAUDE_LOGIN_METHODS.cancel, { loginId: 'L1' }])
    expect(peekLoginOwner('L1', person.id)).toBeNull()
  })

  it('is a quiet success for an id hq does not hold for this person', async () => {
    await start(person, { ownerType: 'user', ownerId: person.id })
    await expect(cancelClaudeLogin({ loginId: 'gone' }, ctx(person))).resolves.toEqual({ ok: true })
    await expect(cancelClaudeLogin({ loginId: 'L1' }, ctx(admin))).resolves.toEqual({ ok: true })
    expect(sent(CLAUDE_LOGIN_METHODS.cancel)).toEqual([])
    expect(peekLoginOwner('L1', person.id)).not.toBeNull()
  })
})
