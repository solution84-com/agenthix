/**
 * hq's typed caller for repository work on a site.
 *
 * Four properties, each pinned rather than read off the code:
 *
 *  1. **Every method name comes from core's constant**, so a typo fails to
 *     compile rather than mismatching at the wire.
 *  2. **Only the four location fields cross.** hq's callers hold repo targets
 *     carrying other columns; the site validates strictly and would refuse
 *     them.
 *  3. **A push gets a budget of its own.** The channel's default is fifteen
 *     seconds, which is a row read's timeout and not a clone's.
 *  4. **An unreachable site surfaces as itself.**
 *
 * And the rule this store exists under: the token goes out and never comes
 * back. Nothing here logs, so the assertion is on what a failure carries.
 *
 * Against the real test database, because what a failure says comes from the
 * site's own row: its label and the protocol version it last presented. The
 * channel to the site is the stand-in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  REPO_CONNECT_TIMEOUT_MS,
  REPO_WORK_METHODS,
  RepoWorkError,
} from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { ChannelRequestFailed, DEFAULT_REQUEST_TIMEOUT_MS } from '../../sites/channel/pendingRequests'
import { connectRepoOnSite, repoStateOnSite } from '../repoWorkStore'
import { SiteUnreachableError } from '../workspaceStore'
import { prisma } from '../../test/db'

const SITE = 'site-logical-1'
const TOKEN = 'ghs_secrettoken'
const loc = { ownerType: 'project' as const, ownerId: 'p1' }

/** The site presents this label and protocol version. */
const siteIs = (label: string, protocolVersion: string | null) =>
  prisma.executionSite.update({ where: { siteId: SITE }, data: { label, protocolVersion } })

beforeEach(async () => {
  request.mockReset()
  await prisma.executionSite.create({ data: { siteId: SITE, label: 'Local site', protocolVersion: '1.0' } })
})

describe('the control-channel calls', () => {
  it('asks the site that was resolved by the caller, under core\'s own method name', async () => {
    request.mockResolvedValue({ isGitRepo: true, hasFiles: false })
    expect(await repoStateOnSite(SITE, { ...loc, workspaceId: 'w1' })).toEqual({ isGitRepo: true, hasFiles: false })
    expect(request).toHaveBeenCalledWith(
      SITE,
      REPO_WORK_METHODS.state,
      { loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', taskId: null } },
      undefined,
    )
  })

  it('sends the direction, the rebuilt URL and the token, and nothing else', async () => {
    request.mockResolvedValue({ connected: true })
    await connectRepoOnSite(SITE, loc, 'push', 'https://github.com/acme/store', TOKEN)
    expect(request).toHaveBeenCalledWith(
      SITE,
      REPO_WORK_METHODS.connect,
      {
        loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
        direction: 'push',
        repoUrl: 'https://github.com/acme/store',
        token: TOKEN,
      },
      REPO_CONNECT_TIMEOUT_MS,
    )
  })

  it('gives a push longer than a row read gets', () => {
    expect(REPO_CONNECT_TIMEOUT_MS).toBeGreaterThan(DEFAULT_REQUEST_TIMEOUT_MS)
  })

  it('drops the extra columns a caller\'s target happens to carry', async () => {
    request.mockResolvedValue({ isGitRepo: false, hasFiles: false })
    await repoStateOnSite(SITE, { ...loc, createdAt: new Date(), name: 'Store' } as never)
    expect(request.mock.calls[0][2]).toEqual({
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
    })
  })
})

describe('when the site will not answer', () => {
  it.each(['offline', 'timeout', 'disconnected'] as const)('reports %s as an unreachable site', async (code) => {
    request.mockRejectedValue(new ChannelRequestFailed('gone', code))
    const err = await connectRepoOnSite(SITE, loc, 'push', 'https://github.com/acme/store', TOKEN).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SiteUnreachableError)
    expect(err).toMatchObject({ siteLabel: 'Local site' })
  })

  it('keeps the failure it got when the site does not know the method', async () => {
    const failure = new ChannelRequestFailed('Unknown method: repo.connect', 'unknown_method')
    request.mockRejectedValue(failure)
    await expect(connectRepoOnSite(SITE, loc, 'push', 'u', TOKEN)).rejects.toBe(failure)
  })

  it('keeps the failure it got when the site has never presented a version', async () => {
    await siteIs('New site', null)
    const failure = new ChannelRequestFailed('Unknown method: repo.state', 'unknown_method')
    request.mockRejectedValue(failure)
    await expect(repoStateOnSite(SITE, loc)).rejects.toBe(failure)
  })
})

describe('a refusal from the site', () => {
  it('comes back as its code, not as prose hq has to match on', async () => {
    request.mockRejectedValue(new Error(new RepoWorkError('push_rejected', 'repo.connect could not push project p1').message))
    const err = await connectRepoOnSite(SITE, loc, 'push', 'u', TOKEN).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoWorkError)
    expect((err as RepoWorkError).code).toBe('push_rejected')
  })

  it('leaves a failure that is not one of ours alone', async () => {
    const other = new Error('handler blew up')
    request.mockRejectedValue(other)
    await expect(repoStateOnSite(SITE, loc)).rejects.toBe(other)
  })

  it('builds no message of its own that carries the token', async () => {
    // The site is what keeps the token out of a refusal; this is the other
    // half — hq writes messages of its own on these paths (unreachable, and the
    // site's refusal re-raised) and none may interpolate the one field it sent.
    const failures = [
      new ChannelRequestFailed('gone', 'offline'),
      new ChannelRequestFailed('Unknown method: repo.connect', 'unknown_method'),
      new Error(new RepoWorkError('git_failed', 'repo.connect failed for project p1').message),
    ]
    for (const failure of failures) {
      request.mockRejectedValue(failure)
      const err: unknown = await connectRepoOnSite(SITE, loc, 'push', 'https://github.com/acme/store', TOKEN).catch(
        (e: unknown) => e,
      )
      expect((err as Error).message).not.toContain(TOKEN)
    }
  })
})
