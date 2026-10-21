/**
 * hq's side of signing in with Claude: the calls to the site, the version
 * check, and hq's ten-minute memory of who started which login. Against the
 * real test database, which holds the default site and the version it runs;
 * only the site's channel is replaced.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CLAUDE_LOGIN_METHODS } from '@agenthix/core'
import { prisma } from '../../test/db'

const request = vi.hoisted(() => vi.fn())
vi.mock('../channel', async () => {
  const { ChannelRequestFailed } = await import('../channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { ChannelRequestFailed } from '../channel/pendingRequests'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import {
  beginLogin,
  completeLogin,
  abandonLogin,
  peekLoginOwner,
  ClaudeLoginUnknownError,
  ClaudeLoginRejectedError,
  LOGIN_MEMORY_MS,
  _resetLoginsForTests,
} from '../claudeLoginStore'

const SITE = 'site-1'
const owner = { ownerType: 'user' as const, ownerId: 'u1' }
const oauthJson = JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: 1_900_000_000_000 } })

beforeEach(async () => {
  vi.clearAllMocks()
  _resetLoginsForTests()
  await prisma.executionSite.create({
    data: { siteId: SITE, label: 'Local site', isDefault: true, credentialHash: 'h'.repeat(64), protocolVersion: '1.0' },
  })
  request.mockImplementation(async (_site: string, method: string) => {
    if (method === CLAUDE_LOGIN_METHODS.start) return { loginId: 'L1', url: 'https://claude.ai/oauth?x=1' }
    if (method === CLAUDE_LOGIN_METHODS.finish) return { oauthJson }
    return { cancelled: true }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('beginLogin', () => {
  it('with no connected site, surfaces the shared error and calls nothing', async () => {
    await prisma.executionSite.deleteMany()
    await expect(beginLogin(owner, 'u1')).rejects.toThrow(/No Execution Site is connected/)
    expect(request).not.toHaveBeenCalled()
  })

  it('asks the default site under core\'s method name (with a budget past the site\'s own 30 s) and returns the link', async () => {
    const out = await beginLogin(owner, 'u1')
    expect(out).toEqual({ loginId: 'L1', url: 'https://claude.ai/oauth?x=1' })
    const [siteId, method, params, timeout] = request.mock.calls[0]
    expect([siteId, method, params]).toEqual([SITE, CLAUDE_LOGIN_METHODS.start, {}])
    expect(timeout).toBeGreaterThan(30_000)
  })

  it('remembers the login for its starter', async () => {
    await beginLogin(owner, 'u1')
    expect(peekLoginOwner('L1', 'u1')).toEqual(owner)
  })

  it('turns an offline site into SiteUnreachableError naming the site', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('not connected', 'offline'))
    const err = await beginLogin(owner, 'u1').catch((e) => e)
    expect(err).toBeInstanceOf(SiteUnreachableError)
    expect(err.message).toContain('Local site')
  })

  it('lets a site refusal (e.g. too many sign-ins) through with its own message', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('Too many sign-ins are in progress', 'handler_error'))
    await expect(beginLogin(owner, 'u1')).rejects.toThrow('Too many sign-ins are in progress')
  })
})

describe('completeLogin', () => {
  beforeEach(async () => {
    await beginLogin(owner, 'u1')
    request.mockClear()
  })

  it('finishes on the remembered site with the code, and returns the owner and the file', async () => {
    const out = await completeLogin('L1', 'u1', '  abc123  ')
    expect(out).toEqual({ owner, oauthJson })
    const [siteId, method, params, timeout] = request.mock.calls[0]
    expect([siteId, method, params]).toEqual([SITE, CLAUDE_LOGIN_METHODS.finish, { loginId: 'L1', code: '  abc123  ' }])
    expect(timeout).toBeGreaterThan(60_000)
  })

  it('forgets the login once it finishes', async () => {
    await completeLogin('L1', 'u1', 'c')
    await expect(completeLogin('L1', 'u1', 'c')).rejects.toBeInstanceOf(ClaudeLoginUnknownError)
  })

  it('refuses an unknown id without calling the site', async () => {
    await expect(completeLogin('nope', 'u1', 'c')).rejects.toBeInstanceOf(ClaudeLoginUnknownError)
    expect(request).not.toHaveBeenCalled()
  })

  it('refuses a person who did not start it, leaving it open for the starter', async () => {
    await expect(completeLogin('L1', 'u2', 'c')).rejects.toBeInstanceOf(ClaudeLoginUnknownError)
    expect(request).not.toHaveBeenCalled()
    expect(peekLoginOwner('L1', 'u1')).toEqual(owner)
  })

  it('refuses an id after ten minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + LOGIN_MEMORY_MS + 1)
    await expect(completeLogin('L1', 'u1', 'c')).rejects.toBeInstanceOf(ClaudeLoginUnknownError)
    expect(request).not.toHaveBeenCalled()
    expect(peekLoginOwner('L1', 'u1')).toBeNull()
  })

  it.each([
    ['not JSON', 'nope'],
    ['no claudeAiOauth', '{}'],
    ['a non-numeric expiry', JSON.stringify({ claudeAiOauth: { expiresAt: '2030-01-01' } })],
  ])('refuses a result that is %s, and forgets the login', async (_label, bad) => {
    request.mockResolvedValue({ oauthJson: bad })
    await expect(completeLogin('L1', 'u1', 'c')).rejects.toBeInstanceOf(ClaudeLoginRejectedError)
    expect(peekLoginOwner('L1', 'u1')).toBeNull()
  })

  it('passes the site\'s "did not accept that code" error through and ends the login', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('Claude did not accept that code', 'handler_error'))
    await expect(completeLogin('L1', 'u1', 'c')).rejects.toThrow('Claude did not accept that code')
    expect(peekLoginOwner('L1', 'u1')).toBeNull()
  })
})

describe('abandonLogin', () => {
  beforeEach(async () => {
    await beginLogin(owner, 'u1')
    request.mockClear()
  })

  it('cancels on the site and forgets the id', async () => {
    await abandonLogin('L1', 'u1')
    expect(request.mock.calls[0].slice(0, 3)).toEqual([SITE, CLAUDE_LOGIN_METHODS.cancel, { loginId: 'L1' }])
    expect(peekLoginOwner('L1', 'u1')).toBeNull()
  })

  it('does nothing for a person who did not start it, and leaves it open', async () => {
    await abandonLogin('L1', 'u2')
    expect(request).not.toHaveBeenCalled()
    expect(peekLoginOwner('L1', 'u1')).toEqual(owner)
  })

  it('is idempotent and never calls the site for an id it does not hold', async () => {
    await abandonLogin('L1', 'u1')
    request.mockClear()
    await expect(abandonLogin('L1', 'u1')).resolves.toBeUndefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('forgets the id even when the site cannot be reached (it removes an abandoned login itself)', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('gone', 'offline'))
    await expect(abandonLogin('L1', 'u1')).resolves.toBeUndefined()
    expect(peekLoginOwner('L1', 'u1')).toBeNull()
  })
})
