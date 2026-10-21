import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { RunCredential } from '@agenthix/core'

vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn(), connectionState: vi.fn(() => 'connected') },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import { hqConnectionManager } from '../../../server/hq/hqConnection'
import { writeRunCredential } from '../boundaryClaudeHome'
import {
  _resetSubscriptionLoginsForTests,
  joinSubscriptionLogin,
  leaveSubscriptionLogin,
  sweepSubscriptionLogins,
  type SubscriptionMembership,
} from '../subscriptionLogins'

const mockSendEvent = vi.mocked(hqConnectionManager.sendEvent)
const mockConnectionState = vi.mocked(hqConnectionManager.connectionState)

const HOUR = 60 * 60 * 1000
const T0 = 1_900_000_000_000

/** A Claude Code credentials document; the refresh token changes with every refresh, as if the provider rotates it. */
const doc = (expiresAt: number) =>
  JSON.stringify({ claudeAiOauth: { accessToken: `at-${expiresAt}`, refreshToken: `rt-${expiresAt}`, expiresAt } })

const granted = (oauthJson: string, grantId: string, loginId = 'login-org'): RunCredential =>
  ({ kind: 'subscription', provider: 'anthropic', oauthJson, grantId, loginId })

let root: string
const homeFor = (name: string) => path.join(root, name, '.claude')
const onDisk = (home: string) => fs.readFile(path.join(home, '.credentials.json'), 'utf-8')
/** What the harness does when it refreshes in a home: it rewrites the document in place. */
const harnessRefreshes = (home: string, expiresAt: number) => fs.writeFile(path.join(home, '.credentials.json'), doc(expiresAt))

/** A run's launch as runLaunch does it: counted into the login, then its credential written. */
async function launch(home: string, credential: RunCredential): Promise<SubscriptionMembership | null> {
  const membership = joinSubscriptionLogin(home, credential)
  await writeRunCredential(home, credential)
  return membership
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockConnectionState.mockReturnValue('connected')
  _resetSubscriptionLoginsForTests()
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'subscription-logins-'))
})

afterEach(async () => {
  _resetSubscriptionLoginsForTests()
  await fs.rm(root, { recursive: true, force: true })
})

describe('parallel runs on one shared login', () => {
  it('a refresh in one home reaches every other home holding the login, so none is left with a retired token', async () => {
    const project = homeFor('project-p1')
    const member = homeFor('person-u1-in-p1')
    await launch(project, granted(doc(T0), 'grant-a'))
    await launch(member, granted(doc(T0), 'grant-b'))

    await harnessRefreshes(project, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()

    expect(await onDisk(member)).toBe(doc(T0 + 8 * HOUR))
    expect(await onDisk(project)).toBe(doc(T0 + 8 * HOUR))
  })

  it('reports the refresh to hq once, against the grant of the home that refreshed', async () => {
    const project = homeFor('project-p1')
    const member = homeFor('person-u1-in-p1')
    await launch(project, granted(doc(T0), 'grant-a'))
    await launch(member, granted(doc(T0), 'grant-b'))

    await harnessRefreshes(project, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()
    await sweepSubscriptionLogins()

    expect(mockSendEvent).toHaveBeenCalledTimes(1)
    expect(mockSendEvent).toHaveBeenCalledWith('site.subscriptionRefreshed', {
      grantId: 'grant-a', oauthJson: doc(T0 + 8 * HOUR), expiresAt: T0 + 8 * HOUR,
    })
  })

  it('reports nothing when no home has refreshed', async () => {
    await launch(homeFor('project-p1'), granted(doc(T0), 'grant-a'))

    await sweepSubscriptionLogins()

    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('never puts an older copy over a newer one', async () => {
    const project = homeFor('project-p1')
    const member = homeFor('person-u1-in-p1')
    await launch(project, granted(doc(T0), 'grant-a'))
    await launch(member, granted(doc(T0), 'grant-b'))

    await harnessRefreshes(project, T0 + 8 * HOUR)
    await harnessRefreshes(member, T0 + 9 * HOUR)
    await sweepSubscriptionLogins()

    expect(await onDisk(member)).toBe(doc(T0 + 9 * HOUR))
    expect(await onDisk(project)).toBe(doc(T0 + 9 * HOUR))
    expect(mockSendEvent).toHaveBeenLastCalledWith('site.subscriptionRefreshed', expect.objectContaining({ grantId: 'grant-b', expiresAt: T0 + 9 * HOUR }))
  })

  it('waits while the harness holds its refresh lock in a home, and copies on a later pass', async () => {
    const project = homeFor('project-p1')
    const member = homeFor('person-u1-in-p1')
    await launch(project, granted(doc(T0), 'grant-a'))
    await launch(member, granted(doc(T0), 'grant-b'))
    await fs.mkdir(path.join(member, '.oauth_refresh.lock'))

    await harnessRefreshes(project, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()
    expect(await onDisk(member)).toBe(doc(T0))

    await fs.rmdir(path.join(member, '.oauth_refresh.lock'))
    await sweepSubscriptionLogins()
    expect(await onDisk(member)).toBe(doc(T0 + 8 * HOUR))
  })

  it('never writes into a home that holds another login', async () => {
    const project = homeFor('project-p1')
    const other = homeFor('project-p2')
    await launch(project, granted(doc(T0), 'grant-a', 'login-p1'))
    await launch(other, granted(doc(T0), 'grant-c', 'login-p2'))

    await harnessRefreshes(project, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()

    expect(await onDisk(other)).toBe(doc(T0))
  })
})

describe('the write at launch', () => {
  it('gives an arriving run the freshest copy on the site, which hq may not hold yet', async () => {
    const project = homeFor('project-p1')
    await launch(project, granted(doc(T0), 'grant-a'))
    await harnessRefreshes(project, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()

    const member = homeFor('person-u1-in-p1')
    await launch(member, granted(doc(T0), 'grant-b'))

    expect(await onDisk(member)).toBe(doc(T0 + 8 * HOUR))
  })

  it('replaces a document from another sign-in, however fresh it is', async () => {
    const home = homeFor('project-p1')
    await launch(home, granted(doc(T0 + 20 * HOUR), 'grant-a', 'login-old'))

    await launch(home, granted(doc(T0 + HOUR), 'grant-b', 'login-new'))

    expect(await onDisk(home)).toBe(doc(T0 + HOUR))
  })
})

describe('a refresh hq cannot be sent', () => {
  it('is held for the next run, and reported once hq is back', async () => {
    const home = homeFor('project-p1')
    const membership = await launch(home, granted(doc(T0), 'grant-a'))
    mockConnectionState.mockReturnValue('disconnected')

    await harnessRefreshes(home, T0 + 8 * HOUR)
    expect(await leaveSubscriptionLogin(membership!)).toBe(true)
    expect(mockSendEvent).not.toHaveBeenCalled()

    mockConnectionState.mockReturnValue('connected')
    await launch(home, granted(doc(T0), 'grant-b'))
    expect(await onDisk(home)).toBe(doc(T0 + 8 * HOUR))
    await sweepSubscriptionLogins()

    expect(mockSendEvent).toHaveBeenCalledWith('site.subscriptionRefreshed', expect.objectContaining({ expiresAt: T0 + 8 * HOUR }))
  })

  it('is not held once it has been reported', async () => {
    const home = homeFor('project-p1')
    const membership = await launch(home, granted(doc(T0), 'grant-a'))

    await harnessRefreshes(home, T0 + 8 * HOUR)

    expect(await leaveSubscriptionLogin(membership!)).toBe(false)
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
  })
})

describe('joinSubscriptionLogin', () => {
  it('counts in only a subscription', () => {
    const home = homeFor('person-u1')
    expect(joinSubscriptionLogin(home, { kind: 'apiKey', provider: 'anthropic', apiKey: 'k' })).toBeNull()
    expect(joinSubscriptionLogin(home, null)).toBeNull()
    expect(joinSubscriptionLogin(home, granted(doc(T0), 'grant-a'))).toEqual({ home, loginId: 'login-org' })
  })

  it('forgets a login once the last run using it has left', async () => {
    const home = homeFor('project-p1')
    const first = await launch(home, granted(doc(T0), 'grant-a'))
    const second = await launch(home, granted(doc(T0), 'grant-b'))
    await leaveSubscriptionLogin(first!)

    await harnessRefreshes(home, T0 + 8 * HOUR)
    await sweepSubscriptionLogins()
    expect(mockSendEvent).toHaveBeenCalledTimes(1)

    await leaveSubscriptionLogin(second!)
    await harnessRefreshes(home, T0 + 16 * HOUR)
    await sweepSubscriptionLogins()
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
  })
})
