import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import type { ScheduledChangeNotice } from '@agenthix/core'
import { recordScheduledChangeNotice, SCHEDULED_CHANGE_NOTIFICATION } from '../scheduledChanges'

// Suspend, resume and erase as members hear of them (host-management spec §15).

let seq = 0
const uniq = (p: string) => `${p}-${++seq}-${Date.now()}`

async function siteWithMember() {
  const site = await prisma.executionSite.create({ data: { siteId: uniq('site'), label: uniq('office-server') } })
  const project = await createProject({ name: uniq('Robot arm firmware'), executionSiteId: site.id })
  const member = await createUser()
  await joinProjectAs(project.id, member.id)
  return { site, project, member }
}

function notice(update: ScheduledChangeNotice['update'], sentAt: string, over: Partial<ScheduledChangeNotice['change']>): ScheduledChangeNotice {
  return {
    update,
    change: {
      id: uniq('c'), kind: 'erase', target: 'site', siteName: 'whatever-it-says', machine: { name: 'office-server', fingerprint: 'f'.repeat(64) },
      at: '2026-10-14T09:00:01.000Z', scheduledBy: { kind: 'machineAdmin' }, scheduledAt: '2026-10-14T09:00:00.000Z',
      state: update === 'started' ? 'running' : 'scheduled', detail: null, expectedMinutes: null,
      ...over,
    },
    sentAt,
    reason: null,
  }
}

const notifications = (userId: string) =>
  prisma.notification.findMany({ where: { userId, type: SCHEDULED_CHANGE_NOTIFICATION }, orderBy: { createdAt: 'asc' } })

describe('an erase hq hears of @SC-933', () => {
  it('a site’s, at once: nothing ahead, then the site has gone', async () => {
    const { site, project, member } = await siteWithMember()
    const from = { from: 'site' as const, siteId: site.siteId }
    const change = notice('scheduled', '2026-10-14T09:00:00.000Z', {})
    expect(await recordScheduledChangeNotice(change, from)).toBe(true)
    expect(await notifications(member.id)).toHaveLength(0)
    await recordScheduledChangeNotice({ ...change, update: 'started', change: { ...change.change, state: 'running' }, sentAt: '2026-10-14T09:00:02.000Z' }, from)
    const told = await notifications(member.id)
    expect(told.map(n => n.title)).toEqual([`${site.label} has gone`])
    expect(told[0].body).toContain(`${project.name} ran there`)
  })

  it('HQ’s, with a date: everyone sees the countdown', async () => {
    const someone = await createUser()
    const change = notice('scheduled', '2026-10-14T09:00:00.000Z', { target: 'hq', at: '2026-10-16T18:00:00.000Z' })
    expect(await recordScheduledChangeNotice(change, { from: 'hqMachine' })).toBe(true)
    const told = await notifications(someone.id)
    expect(told.map(n => n.title)).toEqual(['HQ will be erased'])
    expect(told[0].body).toContain('by a fleet admin. Export what you need, or ask them to cancel.')
  })

  it('HQ’s, at once: no one is told ahead', async () => {
    const someone = await createUser()
    await recordScheduledChangeNotice(notice('scheduled', '2026-10-14T09:00:00.000Z', { target: 'hq' }), { from: 'hqMachine' })
    expect(await notifications(someone.id)).toHaveLength(0)
  })
})
