/**
 * A worker's first run in a person's own space, against the real test database: the person never chooses a site.
 * Their storage is placed on the default site the first time a worker is made there, the worker is made on that
 * site, and the placement stays when another site becomes the default. Site resolution is the real one here; the
 * site itself and the dispatch of the brief are the shared fakes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { ensureExecutionSite } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('./workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as dispatch from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { resolveSiteIdForSession } from '../../../../agents/dispatchSiteResolution'
import { createStartWorkTool } from '../startWork'
import { NEVER_ABORTED, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })

beforeEach(async () => {
  w = await world()
  // The fake answers a fixed site; this file is about where the real resolution places a person's storage.
  dispatch.resolveSiteIdForSession.mockImplementation(resolveSiteIdForSession)
})

const briefInOwnSpace = (brief: string) =>
  tool.run(w.capability, { boundary: 'personal', title: 'Tidy my notes', brief }, NEVER_ABORTED)

const ownWorker = () =>
  prisma.agentSession.findFirstOrThrow({ where: { conversationId: w.conversation.id, primaryOwnerType: 'user' } })

describe("a worker's first run in the person's own space @SC-1042", () => {
  it('places their storage on the default site without asking, and makes the worker there', async () => {
    const site = await ensureExecutionSite()
    expect(await prisma.userStoragePlacement.count({ where: { userId: w.person.id } })).toBe(0)

    expect(await briefInOwnSpace('Tidy my notes.')).toMatchObject({ status: 'accepted' })

    const placement = await prisma.userStoragePlacement.findUniqueOrThrow({ where: { userId: w.person.id } })
    expect(placement.siteId).toBe(site.id)
    const worker = await ownWorker()
    expect(worker.primaryOwnerId).toBe(w.person.id)
    expect(siteStore.createSession).toHaveBeenCalledWith(site.siteId, expect.objectContaining({ id: worker.id }))
  })

  it('keeps later work in their space on that site when another site becomes the default', async () => {
    const first = await ensureExecutionSite()
    await briefInOwnSpace('Tidy my notes.')
    await prisma.executionSite.update({ where: { id: first.id }, data: { isDefault: false } })
    const second = await ensureExecutionSite()
    expect(second.id).not.toBe(first.id)

    expect(await resolveSiteIdForSession(await ownWorker())).toBe(first.siteId)
    expect(await prisma.userStoragePlacement.count({ where: { userId: w.person.id } })).toBe(1)
  })
})
