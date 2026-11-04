/**
 * The Projects screen's Routines view against Postgres (spec §3): every routine
 * in the projects a person is a member of and in their own Chat — never another
 * project's, nor another person's Chat. Run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getRoutinesAcrossProjects } from '../routinesAcross'
import { addMember, ctx, refusedWith, routineIn } from './automationWorld'

describe('getRoutinesAcrossProjects @SC-688', () => {
  it('refuses nobody signed in', async () => {
    await refusedWith(getRoutinesAcrossProjects(undefined, ctx()), 401)
  })

  it("lists the routines of the person's projects and their Chat, each with its place, and no one else's", async () => {
    const me = await createUser()
    const someone = await createUser()
    const mine = await createProject({ name: 'Website Redesign', key: 'WRX' })
    const notMine = await createProject()
    await addMember(mine.id, me.id)
    const chat = await createProject({ personalOwnerId: me.id, personalSpace: true })
    const theirChat = await createProject({ personalOwnerId: someone.id, personalSpace: true })
    const audit = await routineIn(mine.id, me.id, { title: 'Daily site audit' })
    const week = await routineIn(chat.id, me.id, { title: 'Summarise my week' })
    await routineIn(notMine.id, someone.id, { title: 'Not mine' })
    await routineIn(theirChat.id, someone.id, { title: 'Their week' })

    const list = await getRoutinesAcrossProjects(undefined, ctx(me))
    expect(list.map(r => r.id)).toEqual([audit.id, week.id])
    expect(list[0]).toMatchObject({ title: 'Daily site audit', project: { id: mine.id, key: 'WRX', name: 'Website Redesign' }, canManage: true, lastRounds: [] })
    expect(list[1].project).toEqual({ id: chat.id, key: null, name: 'Chat' })
  })

  it('does not let a Viewer manage a routine that is on their behalf, since the server refuses them', async () => {
    const viewer = await createUser()
    const project = await createProject({ name: 'Docs', key: 'DOC' })
    await addMember(project.id, viewer.id, 'VIEWER')
    await routineIn(project.id, viewer.id, { title: 'Weekly digest' })

    const [routine] = await getRoutinesAcrossProjects(undefined, ctx(viewer))
    expect(routine.canManage).toBe(false)
  })
})
