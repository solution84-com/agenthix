/**
 * Reconciling hq's session copies with what a site holds (@SC-346, R-056),
 * against the real test DB: a copy the site has no record of is flagged as
 * dangling, a flag the site contradicts is cleared, and a title the site gave a
 * still-untitled session is delivered. Which site a session belongs to is
 * resolved for real from its storage; which sites are connected is the
 * channel registry, replaced here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, ensureExecutionSite } from '../../test/factories'

const registry = vi.hoisted(() => ({ isOnline: vi.fn(), onlineSiteIds: [] as string[] }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: registry }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { reconcileDanglingSessions, reconcileDanglingSessionsForOnlineSites } from '../danglingSessionReconciler'
import { SiteUnreachableError } from '../../storage/workspaceStore'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const PLACEHOLDER = 'New Conversation'

beforeEach(async () => {
  registry.isOnline.mockReset().mockReturnValue(true)
  registry.onlineSiteIds = []
  await ensureExecutionSite({ siteId: SITE })
})

/** A chat in its person's own storage, which lands on the default site. */
async function chat(data: Record<string, unknown> = {}) {
  const user = await createUser()
  return createSession({ userId: user.id, agentId: (await createAgent()).id, ...data })
}
async function hqCopy(id: string) {
  return prisma.agentSession.findUniqueOrThrow({ where: { id } })
}

describe('reconcileDanglingSessions @SC-346', () => {
  it('skips entirely when the site is not currently connected', async () => {
    const session = await chat()
    registry.isOnline.mockReturnValue(false)
    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 0, flagged: 0, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({})
  })

  it('flags a copy the site has no record of, keeping its other metadata', async () => {
    const session = await chat({ metadata: { context: 'from a task' } })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 1, flagged: 1, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({ context: 'from a task', dangling: true })
  })

  it('leaves a session alone when the site confirms it exists', async () => {
    const session = await chat()
    siteStore.addSession(SITE, { id: session.id })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 1, flagged: 0, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({})
  })

  it('skips — does not flag — when the site is unreachable mid-check, which is not evidence of anything', async () => {
    const session = await chat()
    siteStore.makeSiteUnreachable(SITE, new SiteUnreachableError('Local', SITE))

    const result = await reconcileDanglingSessions(SITE)

    expect(result).toMatchObject({ flagged: 0, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({})
  })

  it('does not check a session that belongs to a different site, nor one whose site cannot be resolved', async () => {
    const elsewhere = await prisma.executionSite.create({ data: { siteId: 'site-other', label: 'Other' } })
    const project = await createProject({ executionSiteId: elsewhere.id })
    const unplaced = await createProject({ executionSiteId: null })
    const user = await createUser()
    const agent = await createAgent()
    const other = await createSession({ userId: user.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    const lost = await createSession({ userId: user.id, agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: unplaced.id })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 0, flagged: 0, unflagged: 0 })
    expect((await hqCopy(other.id)).metadata).toEqual({})
    expect((await hqCopy(lost.id)).metadata).toEqual({})
  })

  it('leaves an archived session out', async () => {
    const session = await chat({ status: 'ARCHIVED' })
    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 0, flagged: 0, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({})
  })

  it('re-checks an already-flagged copy, and does not re-flag one still dangling', async () => {
    const session = await chat({ metadata: { dangling: true } })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 1, flagged: 0, unflagged: 0 })
    expect((await hqCopy(session.id)).metadata).toEqual({ dangling: true })
  })

  it('clears the flag when the site now has the session — drift healed, other metadata kept', async () => {
    const session = await chat({ metadata: { dangling: true, context: 'from a task' } })
    siteStore.addSession(SITE, { id: session.id })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 1, flagged: 0, unflagged: 1 })
    expect((await hqCopy(session.id)).metadata).toEqual({ context: 'from a task' })
  })
})

describe('reconcileDanglingSessionsForOnlineSites (boot entry point) @SC-346', () => {
  it('runs the reconciler for every currently-online site', async () => {
    const second = await prisma.executionSite.create({ data: { siteId: 'site-b', label: 'B' } })
    const project = await createProject({ executionSiteId: second.id })
    const onDefault = await chat()
    const onSecond = await createSession({
      userId: (await createUser()).id, agentId: (await createAgent()).id, primaryOwnerType: 'project', primaryOwnerId: project.id,
    })
    registry.onlineSiteIds = [SITE, 'site-b']

    await reconcileDanglingSessionsForOnlineSites()

    expect((await hqCopy(onDefault.id)).metadata).toEqual({ dangling: true })
    expect((await hqCopy(onSecond.id)).metadata).toEqual({ dangling: true })
  })

  it('one site failing does not stop the others', async () => {
    const session = await chat()
    registry.onlineSiteIds = ['site-broken', SITE]
    registry.isOnline.mockImplementation((siteId: string) => {
      if (siteId === 'site-broken') throw new Error('boom')
      return true
    })

    await expect(reconcileDanglingSessionsForOnlineSites()).resolves.toBeUndefined()
    expect((await hqCopy(session.id)).metadata).toEqual({ dangling: true })
  })
})

// R-056: a title site gave a session, whose frame never reached hq, is delivered
// when hq next reconciles with that site.
describe('reconcileDanglingSessions — delivers the title site holds', () => {
  it('gives a copy still holding the placeholder the title on the site\'s row', async () => {
    const session = await chat({ title: PLACEHOLDER })
    siteStore.addSession(SITE, { id: session.id, title: 'Billing dashboard' })

    await reconcileDanglingSessions(SITE)

    expect((await hqCopy(session.id)).title).toBe('Billing dashboard')
  })

  it('leaves a copy that already has its own title alone — a person may have renamed it', async () => {
    const session = await chat({ title: 'My own name' })
    siteStore.addSession(SITE, { id: session.id, title: 'Billing dashboard' })

    await reconcileDanglingSessions(SITE)

    expect((await hqCopy(session.id)).title).toBe('My own name')
  })

  it.each([
    ['still untitled on site too', PLACEHOLDER],
    ['null on site', null],
    ['empty on site', ''],
  ])('writes nothing when the title is %s', async (_label, siteTitle) => {
    const session = await chat({ title: PLACEHOLDER })
    siteStore.addSession(SITE, { id: session.id, title: siteTitle })

    await reconcileDanglingSessions(SITE)

    expect((await hqCopy(session.id)).title).toBe(PLACEHOLDER)
  })

  it('writes no title for a session the site has no record of', async () => {
    const session = await chat({ title: PLACEHOLDER })
    await reconcileDanglingSessions(SITE)
    expect((await hqCopy(session.id)).title).toBe(PLACEHOLDER)
  })

  it('clears a stale dangling flag and delivers the title in the same pass', async () => {
    const session = await chat({ title: PLACEHOLDER, metadata: { dangling: true } })
    siteStore.addSession(SITE, { id: session.id, title: 'Billing dashboard' })

    expect(await reconcileDanglingSessions(SITE)).toEqual({ checked: 1, flagged: 0, unflagged: 1 })
    expect(await hqCopy(session.id)).toMatchObject({ title: 'Billing dashboard', metadata: {} })
  })
})
