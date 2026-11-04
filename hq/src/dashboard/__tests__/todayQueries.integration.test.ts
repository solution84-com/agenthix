/**
 * Today's numbers for admins (every screen reviewed spec §3), against the real
 * test database with the sites' runs in the shared fake: running now from each
 * connected site's health report, runs today and spend this month from
 * `run.usage`, tasks done this week in the organisation's projects.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUser, createUserWithRole, ensureExecutionSite } from '../../test/factories'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))

import { getTodayNumbers } from '../todayQueries'
import { startOfDay, startOfMonth, startOfWeek } from '../todayNumbers'

const as = (user?: { id: string }) => ({ user }) as any
const health = (running: number, maxAtOnce: number) => ({
  takenAt: new Date().toISOString(), runs: { running, maxAtOnce }, disk: null,
  docker: { running: true, version: null }, agentImage: { name: 'agent', present: true, version: null },
  ceilings: null, memoryNearlyFull: false,
})

describe('getTodayNumbers @SC-668', () => {
  it('is for organisation admins only', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(getTodayNumbers(undefined, as(member))).rejects.toMatchObject({ statusCode: 403 })
  })

  it("adds up running now, runs today, this month's spend and this week's done tasks", async () => {
    const admin = await createUserWithRole('ADMIN')
    const site = await ensureExecutionSite()
    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'ONLINE', health: health(2, 5) } })
    const now = new Date()
    const today = new Date(startOfDay(now).getTime() + 1000).toISOString()
    const earlierThisMonth = startOfMonth(now).toISOString()
    siteStore.addRun(site.siteId, { id: 't1', model: 'claude-sonnet-4-6', usage: { inputTokens: 1000, outputTokens: 0, totalTokens: 1000 } as any, createdAt: today })
    siteStore.addRun(site.siteId, { id: 't2', model: 'claude-sonnet-4-6', usage: { inputTokens: 500, outputTokens: 0, totalTokens: 500 } as any, createdAt: earlierThisMonth })

    const project = await createProject()
    const person = await createUser()
    const own = await createProject({ personalOwnerId: person.id })
    const week = new Date(startOfWeek(now).getTime() + 1000)
    await createTestTask({ data: { projectId: project.id, number: 1, title: 'Done', status: 'DONE', doneAt: week, onBehalfOfUserId: person.id } })
    await createTestTask({ data: { projectId: project.id, number: 2, title: 'Open', onBehalfOfUserId: person.id } })
    await createTestTask({ data: { projectId: own.id, number: 1, title: 'Mine', status: 'DONE', doneAt: week, onBehalfOfUserId: person.id } })

    const numbers = await getTodayNumbers(undefined, as(admin))

    expect(numbers).toMatchObject({ running: 2, mostAtOnce: 5, sitesReporting: 1, tasksDoneThisWeek: 1, openTasks: 1, projectsWithOpenTasks: 1 })
    // On the 1st of a month the earlier run is also today's.
    expect(numbers.runsToday).toBe(startOfDay(now).getTime() === startOfMonth(now).getTime() ? 2 : 1)
    expect(numbers.spendThisMonth.totalTokens).toBe(1500)
    expect(numbers.spendThisMonth.costUsd).toBeGreaterThan(0)
  })

  it('says when a site cut its answer off, so a total that is short does not read as complete', async () => {
    const admin = await createUserWithRole('ADMIN')
    await ensureExecutionSite()
    // The two reads run together, so each answer is chosen by what it asks for, not by the order they arrive.
    siteStore.runUsage.mockImplementation(async (_siteId: string, params: { by: string }) => ({ rows: [], truncated: params.by === 'agent' }))

    const numbers = await getTodayNumbers(undefined, as(admin))

    expect(numbers).toMatchObject({ runsTodayTruncated: true, spendTruncated: false })
  })
})
