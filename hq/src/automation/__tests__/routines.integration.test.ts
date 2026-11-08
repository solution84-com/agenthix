/**
 * A routine's life (adr-0177, N6) against the real test database: made with a cron rule and a timezone, its next
 * due time stored; changed by anyone who works in its project, each change making it run on their behalf; switched
 * on and off; switched off by the system when its person can no longer work there, and back on by someone who can.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { RoutineError, changeRoutine, createRoutine, pauseRoutinesForLostAccess, ROUTINE_LOST_ACCESS_REASON } from '../routines'
import { createProjectWithUsers, assignAgent } from './automationWorld'

const NOW = new Date('2026-11-07T00:46:00Z') // Friday 11:46 in Sydney
const input = (over: Record<string, unknown> = {}) => ({
  title: 'Weekly link check', agentId: 'agent-1', instructions: 'Check the links', cron: '0 9 * * 1-5',
  timezone: 'Australia/Sydney', modelChoice: null, ...over,
})

async function world() {
  const { project, users } = await createProjectWithUsers()
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Reviewer', handle: 'reviewer' } })
  await assignAgent(project.id, 'agent-1')
  return { project, ...users }
}

const person = (userId: string) => ({ kind: 'person' as const, userId })

describe('making a routine', () => {
  it('stores its cron rule and timezone, on, its first time Monday 09:00 in Sydney, for its maker', async () => {
    const { project, person: kai } = await world()
    const r = await createRoutine(project.id, input(), person(kai.id), NOW)
    expect(r).toMatchObject({
      cron: '0 9 * * 1-5', timezone: 'Australia/Sydney', enabled: true, onBehalfOfUserId: kai.id, createdByUserId: kai.id,
      nextDueAt: new Date('2026-11-08T22:00:00.000Z'),
    })
  })

  it('refuses what cannot be a routine, and makes nothing', async () => {
    const { project, person: kai } = await world()
    const refused = (over: Record<string, unknown>) => expect(createRoutine(project.id, input(over), person(kai.id), NOW)).rejects.toBeInstanceOf(RoutineError)
    await refused({ cron: '*/2 * * * *' })
    await refused({ cron: 'every day' })
    await refused({ timezone: 'Mars/Olympus' })
    await refused({ title: '  ' })
    await refused({ agentId: 'not-on-the-project' })
    await refused({ instructions: 'x'.repeat(20_001) })
    expect(await prisma.routine.count()).toBe(0)
  })
})

describe('changing a routine (N6)', () => {
  it("makes it run on behalf of whoever changed it, and leaves its next time alone unless the schedule changed", async () => {
    const { project, person: kai, member: sam } = await world()
    const r = await createRoutine(project.id, input(), person(kai.id), NOW)
    const changed = await changeRoutine(r.id, { instructions: 'Check every link' }, person(sam.id), new Date('2026-11-08T21:59:59Z'))
    expect(changed).toMatchObject({ instructions: 'Check every link', onBehalfOfUserId: sam.id, nextDueAt: r.nextDueAt })
    const moved = await changeRoutine(r.id, { cron: '0 10 * * 1-5' }, person(kai.id), NOW)
    expect(moved).toMatchObject({ onBehalfOfUserId: kai.id, nextDueAt: new Date('2026-11-08T23:00:00.000Z') })
  })

  it('switching it off clears its time; switching it on counts as a change and fires next at the next time from now', async () => {
    const { project, person: kai, member: sam } = await world()
    const r = await createRoutine(project.id, input(), person(kai.id), NOW)
    expect(await changeRoutine(r.id, { enabled: false }, person(kai.id), NOW)).toMatchObject({ enabled: false, nextDueAt: null })
    const on = await changeRoutine(r.id, { enabled: true }, person(sam.id), new Date('2026-11-10T00:00:00Z'))
    expect(on).toMatchObject({ enabled: true, onBehalfOfUserId: sam.id, nextDueAt: new Date('2026-11-10T22:00:00.000Z') })
  })

  it('refuses a schedule too often, and changes nothing', async () => {
    const { project, person: kai, member: sam } = await world()
    const r = await createRoutine(project.id, input(), person(kai.id), NOW)
    await expect(changeRoutine(r.id, { cron: '* * * * *' }, person(sam.id), NOW)).rejects.toThrow(/too often/)
    expect(await prisma.routine.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ cron: '0 9 * * 1-5', onBehalfOfUserId: kai.id })
  })
})

describe('when its person can no longer work in its project', () => {
  it('is switched off with the reason, and someone who works there switches it back on for themselves', async () => {
    const { project, person: kai, member: sam } = await world()
    const r = await createRoutine(project.id, input(), person(kai.id), NOW)
    expect(await pauseRoutinesForLostAccess({ projectId: project.id, onBehalfOfUserId: kai.id })).toBe(1)
    expect(await prisma.routine.findUniqueOrThrow({ where: { id: r.id } }))
      .toMatchObject({ enabled: false, nextDueAt: null, pausedReason: ROUTINE_LOST_ACCESS_REASON })
    // Another change while it is off keeps the reason; switching it on clears it.
    expect(await changeRoutine(r.id, { title: 'Links' }, person(sam.id), NOW)).toMatchObject({ pausedReason: ROUTINE_LOST_ACCESS_REASON })
    expect(await changeRoutine(r.id, { enabled: true }, person(sam.id), NOW))
      .toMatchObject({ enabled: true, pausedReason: null, onBehalfOfUserId: sam.id, nextDueAt: expect.any(Date) })
  })
})
